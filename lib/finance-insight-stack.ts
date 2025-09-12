import { Construct } from 'constructs';
import { Stack, StackProps, RemovalPolicy, CfnOutput, Duration } from 'aws-cdk-lib';

import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';  
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { LambdaConstruct } from './constructs/lambda-construct';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export class FinanceInsightStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const invoiceTable = this.createTable('invoice-table');
    const productTable = this.createTable('product-table');
    const uploadBucket = this.createS3();

    //Lambda presignedUrl
    const getSignedUrl = this.createLambda('get-presigned-url-lambda', {
      UPLOAD_BUCKET_NAME: uploadBucket.bucketName,
      INVOICE_TABLE_NAME: invoiceTable.tableName
    });
    invoiceTable.grantWriteData(getSignedUrl.lambdaFunction);
    uploadBucket.grantPut(getSignedUrl.lambdaFunction);

    //Lambda para procesar imagen
    const processImage = this.createLambda('process-image-lambda',{}, 30);

    const s3Policy = new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${uploadBucket.bucketArn}/*`]
    });
    const textractPolicy = new iam.PolicyStatement({
      actions: ['textract:AnalyzeExpense'],
      resources: ['*']
    });

    processImage.lambdaFunction.addToRolePolicy(s3Policy);
    processImage.lambdaFunction.addToRolePolicy(textractPolicy);
    invoiceTable.grantReadWriteData(processImage.lambdaFunction); 

    //Lambda para transformar información
    const saveInformation = this.createLambda('save-information-lambda', {
      INVOICE_TABLE_NAME: invoiceTable.tableName,
      PRODUCT_TABLE_NAME: productTable.tableName
    });
    invoiceTable.grantReadWriteData(saveInformation.lambdaFunction); 
    productTable.grantReadWriteData(saveInformation.lambdaFunction); 

    //Step Function
    const processImageTask = new tasks.LambdaInvoke(this, 'Extraer Texto de Imagen', {
      lambdaFunction: processImage.lambdaFunction,
      outputPath: '$.Payload',
    });

    const saveTask = new tasks.LambdaInvoke(this, 'Guardar Información', {
      lambdaFunction: saveInformation.lambdaFunction,
      inputPath: '$',
      outputPath: '$.Payload',
    });
    
    const definition = processImageTask.next(saveTask);

    const stateMachine = new sfn.StateMachine(this, 'image-processing-state-machine', {
      definition,
      timeout: Duration.minutes(5),
    });

    const s3Trigger = this.createLambda('s3-trigger-lambda', { 
      STATE_MACHINE_ARN: stateMachine.stateMachineArn
    });

    stateMachine.grantStartExecution(s3Trigger.lambdaFunction);
    
    s3Trigger.lambdaFunction.addEventSource(new S3EventSource(uploadBucket, {
      events: [s3.EventType.OBJECT_CREATED]
    }));
    
    //ApiGateway
    const api = this.createApi();
    const getUrlResource = api.root.addResource('get-presigned-url-lambda');
    getUrlResource.addMethod('POST', new apigw.LambdaIntegration(getSignedUrl.lambdaFunction));

    new CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'URL de la API Gateway para obtener URL de subida.',
    });
    new CfnOutput(this, 'UploadBucketName', {
      value: uploadBucket.bucketName,
      description: 'Nombre del bucket S3 para cargar imagenes.',
    });
  }

  private createS3(): s3.Bucket {
    return new s3.Bucket(this, 'finance-insight-bucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,             
      versioned: true,
      cors: [{ 
        allowedMethods: [s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
      }],
    });
  }

  private createTable(name: string): dynamodb.Table {
    return new dynamodb.Table(this, name, {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });
  }

  private createLambda(name: string, variables?: {}, timeout?: number): LambdaConstruct {
    return new LambdaConstruct(this, name, {
      name: name,
      variables: variables??{},
      timeout: timeout
    });
  }

  private createApi() {
    return new apigw.RestApi(this, 'finance-insight-api', {
      restApiName: 'Finance Insight Service',
      description: 'Finance Insight Service',
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: apigw.Cors.DEFAULT_HEADERS,
      },
    });
  }
}