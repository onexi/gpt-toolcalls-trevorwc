import express from 'express';
import bodyParser from 'body-parser';
import { OpenAI } from 'openai';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import path, { join } from 'path';
dotenv.config()

// Initialize Express server
const app = express();
app.use(bodyParser.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.resolve(process.cwd(), './public')));

const memoryFilePath = join(process.cwd(), './functions/memories.csv')

// OpenAI API configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

let state = {
    chatgpt: false,
    assistant_id: "",
    assistant_name: "",
    dir_path: "",
    news_path: "",
    thread_id: "",
    user_message: "",
    run_id: "",
    run_status: "",
    vector_store_id: "",
    tools: [],
    parameters: []
};

let conversationState = {
    correctionInProgress: false,
    correctionKey: null,
    availableKeys: []
};

// Default route to serve index.html for any undefined routes
app.get('*', (req, res) => {
    res.sendFile(path.resolve(process.cwd(), './public/index.html'));
});

// Function to dynamically load all available functions
async function getFunctions() {
    const files = fs.readdirSync(path.resolve(process.cwd(), "./functions"));
    const openAIFunctions = {};

    for (const file of files) {
        if (file.endsWith(".js")) {
            const moduleName = file.slice(0, -3);
            const modulePath = `./functions/${moduleName}.js`;
            const { details, execute } = await import(modulePath);

            openAIFunctions[moduleName] = {
                "details": details,
                "execute": execute
            };
        }
    }
    return openAIFunctions;
}

app.post('/api/openai-call', async (req, res) => {
    const { user_message, conversation_stage } = req.body;

    const functions = await getFunctions();

    // Step 1: Handle "What do you know about me?" and prompt for corrections
    if (user_message.toLowerCase().includes("know about me")) {
        const result = await functions['provideMemories'].execute();

        // Extract keys from the memory data and store them
        conversationState.availableKeys = Object.keys(result).filter(key => key !== 'message');

        // Respond with known information and prompt for corrections
        res.json({
            message: result.message +
                "\nTell me which keys are incorrect, if any! " +
                "Do so by tellling me something is wrong."
        });

        // Set correction flow to active and wait for the next user input
        conversationState.correctionInProgress = true;
        return;
    }
    // Step 1: Detect if the message contains "is wrong"
    if (user_message.toLowerCase().includes("is wrong")) {
        const lowerCaseMessage = user_message.toLowerCase();
        const words = lowerCaseMessage.split(" ");

        // Find the index of "is"
        const wrongIndex = words.indexOf("is");
        const getMemoryKeys = () => {
            try {
                const data = fs.readFileSync(memoryFilePath, 'utf8');
                const lines = data.split('\n').filter(line => line.trim());
                const keys = lines.map(line => line.split(',')[0].trim()); // Extract the first column as keys
                return keys;
            } catch (error) {
                console.error('Error reading memory file:', error);
                return [];
            }
        };

        // Ensure at least one word precedes "is wrong"
        if (wrongIndex > 0) {
            const keyToDelete = words[wrongIndex - 1];  // Extract the word before "is wrong"
            const memoryKeys = getMemoryKeys();
            // Check if the extracted key exists in the available keys
            const matchingKey = memoryKeys.find(key =>
                key.toLowerCase() === keyToDelete
            );

            if (matchingKey) {
                // Delete the memory associated with the matching key
                const deleteResult = await functions['editMemories'].execute('delete', matchingKey);

                // Respond with confirmation of deletion
                res.json({ message: deleteResult.message });
                return;
            } else {
                // Handle case where the key isn't found
                res.json({
                    message: `I couldn't find a matching key for "${keyToDelete}". ` +
                             "Please make sure the key exists."
                });
                return;
            }
        } else {
            // If no word precedes "is wrong", ask for clarification
            res.json({
                message: "Please provide a valid key before 'is wrong'."
            });
            return;
        }
    }

    const personalPronouns = ["i", "me", "my", "mine", "myself"];

    // Step 5: Detect personal pronouns (e.g., "I", "me", "my") in the user's message
    const words = user_message.toLowerCase().split(" ");
    const containsPersonalInfo = personalPronouns.some(pronoun => words.includes(pronoun));

    if (containsPersonalInfo) {
        // Find the pronoun and extract the next two words to form the key
        const pronounIndex = words.findIndex(word => personalPronouns.includes(word));
        
        // Extract the first two words after the pronoun (make sure we have at least two words)
        let extractedKey = '';
        if (pronounIndex >= 0 && words.length > pronounIndex + 2) {
            extractedKey = `${words[pronounIndex + 1]}_${words[pronounIndex + 2]}`;
        } else if (words.length > pronounIndex + 1) {
            extractedKey = words[pronounIndex + 1];
        }

        // If no key could be formed, skip saving the memory
        if (!extractedKey) {
            res.json({ message: "Couldn't extract a valid key from the message." });
            return;
        }

        // Replace spaces in the key with underscores for CSV compatibility
        extractedKey = extractedKey.replace(/\s+/g, '_');

        // Save the entire message as the memory
        const memory = user_message;
        const result = await functions['scratchpad'].execute('set', extractedKey, memory);

        res.json({ message: `Memory saved under key "${extractedKey}".` });
        return;
    }

    // Step 6: Proceed with the normal OpenAI API flow (ChatGPT answering normally)
    let messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: user_message }
    ];

    try {
        // Make the OpenAI API call for a normal ChatGPT response
        const response = await openai.chat.completions.create({
            model: 'gpt-4o', // Use your desired model
            messages: messages
        });

        // Extract the output from the response
        const output = response.choices[0].message.content;

        // Respond with ChatGPT's normal answer
        res.json({ message: output });

    } catch (error) {
        res.status(500).json({ error: 'OpenAI API failed', details: error.message });
    }
});



app.post('/api/prompt', async (req, res) => {
    // just update the state with the new prompt
    state = req.body;
    try {
        res.status(200).json({ message: `got prompt ${state.user_message}`, "state": state });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'User Message Failed', "state": state });
    }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
