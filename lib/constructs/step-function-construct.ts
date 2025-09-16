import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";
import { LambdaConstruct } from "./lambda-construct";
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

export interface StepFunctionProps {
    processImage: LambdaConstruct;
    itemClassifier: LambdaConstruct;
    saveInformation: LambdaConstruct;
}
  
export class StepFunctionConstruct extends Construct {
    sfn: sfn.StateMachine;

    constructor(scope: Construct, id: string, props: StepFunctionProps) {
        super(scope, id);

        const { processImage, itemClassifier, saveInformation } = props;

        const processImageTask = new tasks.LambdaInvoke(this, 'Extraer Texto de Imagen', {
            lambdaFunction: processImage.lambdaFunction,
            outputPath: '$.Payload',
        });

        const itemClassifierTask = new tasks.LambdaInvoke(this, 'Clasificar productos por categoria', {
            lambdaFunction: itemClassifier.lambdaFunction,
            outputPath: '$.Payload',
        });
    
        const saveTask = new tasks.LambdaInvoke(this, 'Guardar Información', {
            lambdaFunction: saveInformation.lambdaFunction,
            inputPath: '$',
            outputPath: '$.Payload',
        });
        
        const definition = processImageTask
            .next(itemClassifierTask)
            .next(saveTask);
    
        this.sfn = new sfn.StateMachine(this, 'image-processing-state-machine', {
            definition,
            timeout: Duration.minutes(5),
        });
    }
  }