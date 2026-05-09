// server/serperService.js — Serper API Integration for Web Search

/**
 * Detects if a message is a greeting or casual conversation
 * @param {string} message - The user message to analyze
 * @returns {boolean} - True if it's a greeting/casual, false if it's a real question
 */
function isGreetingOrCasual(message) {
    if (!message) return false;
    
    const lowerMsg = message.toLowerCase().trim();
    
    // Greeting patterns
    const greetingPatterns = [
        /^(hi|hello|hey|hiya|greetings|good morning|good afternoon|good evening|good night)[\s!?]*$/,
        /^(what\'s up|how are you|how\'s it going|how do you do)[\s!?]*$/,
        /^(thanks|thank you|cheers|appreciate it|thanks a lot)[\s!?]*$/,
        /^(goodbye|bye|see you|take care|farewell)[\s!?]*$/,
        /^(ok|okay|yes|yeah|yep|nope|no)[\s!?]*$/,
    ];
    
    // Casual conversation patterns (very short, non-informational)
    const casualPatterns = [
        /^(nice|cool|awesome|great|lol|haha)[\s!?]*$/,
        /^(i don't know|idk|not sure|dunno)[\s!?]*$/,
        /^(what|who|where|when)[\s!?]*$/, // Single word questions
        /^(really|seriously|for real)[\s!?]*$/,
    ];
    
    // Check all patterns
    const allPatterns = [...greetingPatterns, ...casualPatterns];
    for (const pattern of allPatterns) {
        if (pattern.test(lowerMsg)) {
            return true;
        }
    }
    
    // If message is very short (less than 3 words) and doesn't look like a real question
    const wordCount = lowerMsg.split(/\s+/).length;
    if (wordCount === 1) {
        return true; // Single word is likely casual
    }
    
    return false;
}

/**
 * Searches using Serper API and returns formatted results
 * @param {string} query - The search query
 * @param {string} apiKey - Serper API key
 * @returns {Promise<string>} - Formatted search results or empty string if failed
 */
async function searchSerper(query, apiKey) {
    if (!apiKey || !query) {
        return '';
    }

    try {
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
                'X-API-KEY': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: query,
                num: 10, // Get top 10 results
                gl: 'us',
                hl: 'en',
            }),
        });

        if (!response.ok) {
            console.error(`[Serper] API error: ${response.status}`);
            return '';
        }

        const data = await response.json();
        
        if (!data.organic || data.organic.length === 0) {
            return '';
        }

        // Format search results
        let formattedResults = '## Web Search Results:\n\n';
        
        // Add answer box if available
        if (data.answerBox) {
            formattedResults += `${data.answerBox.answer || data.answerBox.snippet}\n\n`;
        }

        // Add top 5 results
        const topResults = data.organic.slice(0, 5);
        topResults.forEach((result) => {
            formattedResults += `**${result.title}**\n`;
            formattedResults += `${result.snippet}\n\n`;
        });

        return formattedResults;
    } catch (error) {
        console.error('[Serper] Error fetching search results:', error);
        return '';
    }
}

/**
 * Gets search context for a query using Serper API
 * @param {string} query - The search query
 * @param {string} serperKey - Serper API key
 * @returns {Promise<string>} - Search context to include in system instruction
 */
async function getSearchContext(query, serperKey) {
    // If no Serper key or it's a greeting/casual, skip search
    if (!serperKey || isGreetingOrCasual(query)) {
        return '';
    }

    const searchResults = await searchSerper(query, serperKey);
    return searchResults;
}

module.exports = {
    isGreetingOrCasual,
    searchSerper,
    getSearchContext,
};
