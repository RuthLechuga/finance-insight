import { classifyVendor, classifyProduct, VendorInfo } from "./utils/item-classifier";

interface InputEvent {
    sourceObject: {
      bucketName: string;
      objectKey: string;
    };
    extractedData: any;
}

interface ClassifiedItem {
    productName: string;
    category: string;
}

export const handler = async (event: InputEvent) => {
    try {
        const storeName = event.extractedData.summary.VENDOR_NAME;
        const country = event.extractedData.summary.COUNTRY;
        const lines = event.extractedData.lineItems;
        
        // Llama a la función importada para clasificar el comercio
        const vendorInfo: VendorInfo = await classifyVendor(storeName, country);

        let classifiedItems: ClassifiedItem[];

        if (vendorInfo.isGrocery) {
            console.log(`Comercio '${storeName}' identificado como supermercado. Procesando items individualmente.`);
            const classificationPromises = lines.map((line: any) => 
                classifyProduct(line.ITEM, storeName, country)
                .then(category => ({ ...line, CATEGORY: category }))
            );
            classifiedItems = await Promise.all(classificationPromises);
        } else {
            console.log(`Comercio '${storeName}' identificado como '${vendorInfo.category}'. Asignando esta categoría a todos los items.`);
            classifiedItems = lines.map((line: any) => ({
                ...line,
                category: vendorInfo.category,
            }));
        }
        
        event.extractedData.lineItems = classifiedItems; 
        return {
            ...event,
            vendorCategory: vendorInfo.category
        };
        
    } catch (error) {
        console.error("Error en el handler principal:", error);
        return {
            status: 'Error',
            errorMessage: (error instanceof Error) ? error.message : 'Error desconocido'
        }
    }
};