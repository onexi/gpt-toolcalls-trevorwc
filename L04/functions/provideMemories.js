import { join } from 'path';
import fs from 'fs';

const execute = async () => {
    const filePath = join(process.cwd(), './functions/memories.csv');
    
    try {
        // Read the contents of the memories.csv file
        const data = await fs.promises.readFile(filePath, 'utf8').catch(() => '');
        
        // Split the file data into lines, ignoring empty lines
        const memories = data
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                const [key, memory] = line.split(',');
                return { key: key.trim(), memory: memory.trim() };
            });

        // If there are no memories, return a message saying the bot doesn't know much yet
        if (memories.length === 0) {
            return { message: "I don't know much about you yet." };
        }

        // If memories exist, format them into a response string
        let memoryResponse = "Here's what I know about you so far:\n";
        memories.forEach(memoryObj => {
            memoryResponse += `- ${memoryObj.key}: ${memoryObj.memory}\n`;
        });

        return { message: memoryResponse };
    } catch (err) {
        console.error('Error reading the memories file:', err);
        return { error: "There was an error retrieving your memories." };
    }
}

const details = {
    "type": "function",
    "name": "provideMemories",
    "description": "This function provides the user with what the bot knows about them based on stored memories.",
    "parameters": {}
};

export { execute, details };
