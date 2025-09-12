import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const dynamoDbClient = new DynamoDBClient({});

interface InputEvent {
    sourceObject: {
      bucketName: string;
      objectKey: string;
    };
    extractedData: any;
    fileId: any;
}

const INVOICE_TABLE_NAME = process.env.INVOICE_TABLE_NAME;
const PRODUCT_TABLE_NAME = process.env.PRODUCT_TABLE_NAME;
  
export const handler = async (event: InputEvent) => {
  console.log(event)

  return {
    status: 'TRANSFORMATION_COMPLETE'
  };
};