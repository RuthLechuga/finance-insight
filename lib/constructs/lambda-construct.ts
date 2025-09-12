import path from "path";
import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

export interface LambdaProps {
    name: string;
    timeout?: number;
    variables: {};
}
  
export class LambdaConstruct extends Construct {
    public readonly lambdaFunction: NodejsFunction; 

    constructor(scope: Construct, id: string, props: LambdaProps) {
        super(scope, id);

        this.lambdaFunction = new NodejsFunction(this, props.name, {
            runtime: Runtime.NODEJS_20_X,
            handler: 'handler',
            timeout: Duration.seconds(props.timeout??10),
            entry: path.join(__dirname, `../../lambda/${props.name}.ts`),
            environment: props.variables,
            bundling: {
                minify: true,
                externalModules: ['@aws-sdk/*']
            },
        });
    }
  }