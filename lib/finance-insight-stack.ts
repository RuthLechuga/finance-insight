import { Construct } from 'constructs';
import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';

import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';  
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaConstruct } from './constructs/lambda-construct';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { StepFunctionConstruct } from './constructs/step-function-construct';

export class FinanceInsightStack extends Stack {

  private invoiceTable: dynamodb.Table;
  private productTable: dynamodb.Table;
  private uploadBucket: s3.Bucket;
  private processImage: LambdaConstruct;
  private saveInformation: LambdaConstruct;
  private itemClassifier: LambdaConstruct;
  
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //DynamoDb
    this.invoiceTable = this.createTable('invoice-table');
    this.productTable = this.createTable('product-table');

    //S3
    this.uploadBucket = this.createS3();

    //Business Logic Lambdas
    this.processImage = this.createProcessImageLambda();
    this.itemClassifier = this.createItemClassifierLambda();
    this.saveInformation = this.createSaveInformationLambda();

    //Step Function
    const stateMachine = new StepFunctionConstruct(this, 'image-processing-state-machine', {
      processImage: this.processImage,
      saveInformation: this.saveInformation,
      itemClassifier: this.itemClassifier
    });

    //Triggers & API Lambdas
    this.createS3TriggerLambda(stateMachine.sfn);
    const getSignedUrlLambda = this.createGetSignedUrlLambda();
    
    //ApiGateway
    const api = this.createApi();
    const getUrlResource = api.root.addResource('get-presigned-url-lambda');
    getUrlResource.addMethod('POST', new apigw.LambdaIntegration(getSignedUrlLambda.lambdaFunction));

    new CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'URL de la API Gateway para obtener URL de subida.',
    });
    new CfnOutput(this, 'UploadBucketName', {
      value: this.uploadBucket.bucketName,
      description: 'Nombre del bucket S3 para cargar imagenes.',
    });
  }

  private createProcessImageLambda(): LambdaConstruct {
    const lambdaConstruct = new LambdaConstruct(this, 'process-image-lambda', {
      name: 'process-image-lambda',
      variables: {},
      timeout: 30
    });

    lambdaConstruct.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${this.uploadBucket.bucketArn}/*`]
    }));
    lambdaConstruct.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['textract:AnalyzeExpense'],
      resources: ['*']
    }));
    this.invoiceTable.grantReadWriteData(lambdaConstruct.lambdaFunction); 
    
    return lambdaConstruct;
  }

  private createItemClassifierLambda(): LambdaConstruct {
    const lambdaConstruct = new LambdaConstruct(this, 'item-classifier-lambda', {
      name: 'item-classifier-lambda',
      variables: {
        BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
        PRODUCT_TABLE_NAME: this.productTable.tableName
      },
      timeout: 30
    });
    lambdaConstruct.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: ['arn:aws:bedrock:*::foundation-model/anthropic.claude-3-haiku-20240307-v1:0'],
    }));
    this.productTable.grantReadWriteData(lambdaConstruct.lambdaFunction); 
    return lambdaConstruct;
  }
  
  private createSaveInformationLambda(): LambdaConstruct {
    const lambdaConstruct = new LambdaConstruct(this, 'save-invoice-lambda', {
      name: 'save-invoice-lambda',
      variables: {
        INVOICE_TABLE_NAME: this.invoiceTable.tableName
      }
    });

    this.invoiceTable.grantReadWriteData(lambdaConstruct.lambdaFunction); 
    this.productTable.grantReadWriteData(lambdaConstruct.lambdaFunction);

    return lambdaConstruct;
  }

  private createGetSignedUrlLambda(): LambdaConstruct {
    const lambdaConstruct = new LambdaConstruct(this, 'get-presigned-url-lambda', {
      name: 'get-presigned-url-lambda',
      variables: {
        UPLOAD_BUCKET_NAME: this.uploadBucket.bucketName,
        INVOICE_TABLE_NAME: this.invoiceTable.tableName
      }
    });

    this.invoiceTable.grantWriteData(lambdaConstruct.lambdaFunction);
    this.uploadBucket.grantPut(lambdaConstruct.lambdaFunction);
    
    return lambdaConstruct;
  }

  private createS3TriggerLambda(stateMachine: sfn.StateMachine): LambdaConstruct {
    const lambdaConstruct = new LambdaConstruct(this, 's3-trigger-lambda', {
      name: 's3-trigger-lambda',
      variables: {
        STATE_MACHINE_ARN: stateMachine.stateMachineArn
      }
    });
    
    stateMachine.grantStartExecution(lambdaConstruct.lambdaFunction);
    
    lambdaConstruct.lambdaFunction.addEventSource(new S3EventSource(this.uploadBucket, {
      events: [s3.EventType.OBJECT_CREATED]
    }));
    
    return lambdaConstruct;
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

  private createApi(): apigw.RestApi {
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