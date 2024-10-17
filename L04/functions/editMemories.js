import { join } from 'path';
import fs from 'fs';

const execute = async (action, key) => {
    const filePath = join(process.cwd(), './functions/memories.csv');

    try {
        // Read the current memory file
        const data = await fs.promises.readFile(filePath, 'utf8').catch(() => '');

        let lines = data.split('\n').filter(line => line.trim());

        if (action === 'delete') {
            // Normalize the key to ensure underscores and lowercase for matching
            const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');
            
            // Delete the memory with the specified key
            const updatedLines = lines.filter(line => {
                const [storedKey] = line.split(',');
                return storedKey.trim().toLowerCase() !== normalizedKey;  // Case-insensitive comparison
            });

            // Check if any memory was actually deleted
            if (lines.length === updatedLines.length) {
                return { message: `Memory with key "${key}" not found.` };
            }

            // Write the updated memories back to the file
            await fs.promises.writeFile(filePath, updatedLines.join('\n') + '\n');
            return { message: `Memory with key "${key}" has been deleted.` };
        }

    } catch (err) {
        console.error('Error updating memories:', err);
        return { error: 'Error updating memories' };
    }
};

const details = {
    "type": "function",
    "name": "editMemories",
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "description": "Action to take: 'delete'."
            },
            "key": {
                "type": "string",
                "description": "The key representing the piece of information to delete."
            }
        },
        "required": ["action", "key"]
    }
};

export { execute, details };
