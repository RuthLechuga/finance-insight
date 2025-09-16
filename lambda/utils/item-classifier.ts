import {
    BedrockRuntimeClient,
    InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export interface VendorInfo {
    category: string;
    isGrocery: boolean;
}

const bedrockClient = new BedrockRuntimeClient();
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID;
const PRODUCT_TABLE_NAME = process.env.PRODUCT_TABLE_NAME;

/**
 * Llama a Bedrock UNA VEZ para clasificar el tipo de comercio.
 */
export async function classifyVendor(storeName: string, country: string): Promise<VendorInfo> {
    try {
        const prompt = `Analiza el siguiente nombre de comercio. Responde únicamente con un objeto JSON con dos claves: "category" (la categoría del comercio, ej: Supermercado, Restaurante, Ferretería) y "isGrocery" (un booleano true si vende principalmente abarrotes o comida, de lo contrario false).
        Comercio: "${storeName}"
        País: "${country}"`;

        const responseBody = await invokeBedrock(prompt);
        const parsedResponse = JSON.parse(responseBody);

        return {
            category: parsedResponse.category || 'General',
            isGrocery: parsedResponse.isGrocery === true,
        };
    } catch (error) {
        console.error(`Error clasificando el comercio "${storeName}":`, error);
        return { category: 'General', isGrocery: false };
    }
}

/**
 * Orquesta la clasificación de un producto, usando caché de DynamoDB primero.
 */
export async function classifyProduct(productName: string, storeName: string, country: string): Promise<string> {
    const cachedCategory = await getProductFromDB(productName);
    if (cachedCategory) {
        console.log(`CACHE HIT para el producto: "${productName}". Categoría: ${cachedCategory}`);
        return cachedCategory;
    }
    console.log(`CACHE MISS para el producto: "${productName}". Llamando a Bedrock.`);

    const prompt = `Asigna una única categoría de compra, en singular y con mayúscula inicial, para el siguiente producto de supermercado.
        Producto: "${productName}"
        Tienda: "${storeName}"
        País: "${country}"
        Responde únicamente con el nombre de la categoría. Sin explicaciones.`;
    
    const newCategory = await invokeBedrock(prompt);
    
    if (newCategory && newCategory !== 'Otros') {
        await saveProductToDB(productName, newCategory);
    }
    
    return newCategory || 'Otros';
}

/**
 * Busca un producto en la tabla de caché de DynamoDB.
 */
async function getProductFromDB(productName: string): Promise<string | null> {
    if (!PRODUCT_TABLE_NAME) return null;
    try {
        const command = new GetCommand({
            TableName: PRODUCT_TABLE_NAME,
            Key: { productName: productName.trim().toLowerCase() }
        });
        const result = await docClient.send(command);
        return result.Item ? result.Item.category : null;
    } catch (error) {
        console.error("Error al leer de DynamoDB:", error);
        return null;
    }
}

/**
 * Guarda o actualiza un producto en la tabla de caché de DynamoDB.
 */
async function saveProductToDB(productName: string, category: string): Promise<void> {
    if (!PRODUCT_TABLE_NAME) return;
    try {
        const command = new PutCommand({
            TableName: PRODUCT_TABLE_NAME,
            Item: {
                id: productName.trim().toLowerCase(),
                category: category,
                lastUpdated: new Date().toISOString()
            }
        });
        await docClient.send(command);
        console.log(`CACHE WRITE para el producto: "${productName}" con categoría: ${category}`);
    } catch (error) {
        console.error("Error al escribir en DynamoDB:", error);
    }
}

/**
 * Función genérica para invocar el modelo de Bedrock y obtener la respuesta.
 */
async function invokeBedrock(prompt: string): Promise<string> {
    if (!BEDROCK_MODEL_ID) throw new Error("BEDROCK_MODEL_ID no está definido.");
    try {
        const payload = {
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 200,
            messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
        };
  
        const command = new InvokeModelCommand({
            body: new TextEncoder().encode(JSON.stringify(payload)),
            modelId: BEDROCK_MODEL_ID,
        });
  
        const response = await bedrockClient.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        return responseBody.content[0].text.trim();
    } catch (error) {
        console.error("Error al invocar Bedrock:", error);
        throw error;
    }
}