"use strict";

import {ProgressBarUI} from './ProgressBarUI';

import WebLLM from './WebLLM';
import {Config, getConfig} from './config';


// Create a progress bar element
const progressBar = new ProgressBarUI();

const validTextElements = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'ARTICLE', 'SECTION', 'LI', 'FIGCAPTION', 'FONT','I','A'];
// Initialize the engine
let llm: WebLLM;
let isInitializing = false;

let config:Config;


async function init() {
    if (isInitializing) {
        console.log('Engine initialization already in progress');
        return;
    }

    isInitializing = true;
    let port = chrome.runtime.connect({ name: "popup-connection" });
    try {

        config = await getConfig();
        console.log("WebLLM engine initializing with model ",config.modelName," please wait...")
        llm = await WebLLM.createAsync(progressBar.showProgress.bind(progressBar), config.modelName);
        progressBar.hide();
        console.log('WebLLM engine initialized successfully');
    } catch (error) {
        console.log('Error initializing engine:', error);
        resetWorker();
    } finally {
        isInitializing = false;
    }
}


function waitingMessage() {
    const message = document.createElement('span');
    message.textContent = 'Translating ';
    message.style.display = 'inline-block';
    message.style.marginLeft = '5px';
    message.style.fontStyle = 'italic';
    message.style.color = '#666';

    // Add a simple animation
    const dots = document.createElement('span');
    dots.textContent = '';
    message.appendChild(dots);

    // Animate the dots
    let dotsCount = 0;
    const dotsInterval = setInterval(() => {
        dots.textContent = '.'.repeat(dotsCount % 4);
        dotsCount++;
    }, 300);
    return {message: message, dotsInterval};
}

function addTranslatorButton(element: HTMLElement, index: number) {

    // Create a button element
    const button = document.createElement('button');
    button.textContent = 'AI T';
    button.dataset.paragraphIndex = index.toString();
    button.className = 'button-toto-translator';
    button.style.display = 'inline-block'; // Always show the button when added

    // Add click event listener to the button
    button.addEventListener('click', async function () {
        // Get the text of the paragraph
        if(!element.textContent)
            return;

        // @ts-ignore
        const paragraphText = (element.textContent).replace(button.textContent, '');

        // Use the engine to translate the text
        try {
            if (!llm) {
                console.log('Engine not initialized yet, please wait...');
                return;
            }

            console.log('Translating text using the engine...');
            const translatorContainer = document.createElement('div');
            translatorContainer.className = 'toto-translator-container';

            const {message, dotsInterval} = waitingMessage();

            console.log(`Paragraph ${index + 1} text:`, paragraphText);
            translatorContainer.appendChild(message);
            element.parentNode.insertBefore(translatorContainer, element.nextSibling);
            const translationPrompt =
                `**Role:** Expert ${config.targetLanguage} Translator & Corrector for ${config.sourceLanguage} text.
                **Input:** A potentially flawed ${config.sourceLanguage} text segment. It might have transcription errors, missing punctuation, or unclear parts.
                **Output Rule**: Reply only with the  ${config.targetLanguage} translation. Do not include introductions, explanations, or any ${config.sourceLanguage}. Do not write anything else.

                **Task:**
                1.  **Interpret & Correct:** Understand the provided ${config.sourceLanguage} text (${paragraphText}). Mentally correct errors (typos, misheard words, grammar, punctuation) to determine the most likely intended complete sentence(s). Use the software development context.
                2.  **Translate:** Translate the *corrected and understood* ${config.sourceLanguage} meaning into fluent, natural-sounding ${config.targetLanguage}. Ensure the *entire* intended message is fully translated.
                3. **Preserve Terms:** Do not translate specific technical terms
                
                **Output Instructions:**
                *   Provide *only* the final ${config.targetLanguage} translation.
                *   The output must be the complete translation, covering the full meaning of the interpreted source text.
                *   Do not include the original text, the corrected source text, or any explanations.
                
                Example:
                Text to Process: Sometimes ChatGPT generate text that seem fluent, but doesn’t actually make sense.
                Expected Output: A volte ChatGPT genera testi che sembrano fluidi, ma in realtà non hanno senso.
                
                **Text to Process:**
                ${paragraphText}`

            await llm.sendMessage(translationPrompt, (translation) => {
                // Clear the loading spinner and set the translation text
                translatorContainer.textContent = translation;
            });

            // Clear the interval when translation is complete
            clearInterval(dotsInterval);

        } catch (error) {
            console.error('Error during translation:', error);
            resetWorker()
        }
    });

    // Insert the button after the paragraph
    element.appendChild(button);
}


// Handle reconnection when page comes back from bfcache (back/forward cache)
function setupReconnectionHandlers() {
    // Listen for pageshow events with persisted=true (page restored from bfcache)
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            console.log('Page was restored from back/forward cache, reconnecting WebLLM...');
            init();
        }
    });

    // Listen for visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !llm) {
            console.log('Page became visible and WebLLM is not initialized, reconnecting...');
            init();
        }
    });

    // Listen for custom connection lost events from WebLLM
    window.addEventListener('webllm-connection-lost', () => {
        console.log('WebLLM connection lost event received, attempting to reconnect...');
        // Send a message to the background script to notify about the connection loss
        chrome.runtime.sendMessage({type: 'webllm-connection-lost', timestamp: Date.now()}, (response) => {
            console.log('Initilization again after connection lost event received:',response)
            init();
        });
    });
}

// Initialize the engine
init();

// Set up reconnection handlers
setupReconnectionHandlers();

// Track the currently active element when key is pressed

// Define the activation key (Alt key by default)
const ACTIVATION_KEY = 'Alt';



// Add keydown event listener to activate translator
document.addEventListener("keydown", (e) => {
    if (e.key === ACTIVATION_KEY) {

        // Get the element under the mouse cursor using stored coordinates
        const elemUnderCursor = document.elementFromPoint(mouseX, mouseY);

        if(!(elemUnderCursor instanceof HTMLElement) || !hasDirectText(elemUnderCursor)){
            return;
        }

        const elem = retrieveElement(elemUnderCursor)

        if(!elem){
            return
        }

        addTranslatorButton(elem, 0);
    }
});

function retrieveElement(elem:HTMLElement){

    if (elem.querySelector('.button-toto-translator') || elem.classList.contains('.toto-translator-container')) {
        return;
    }

    if(validTextElements.includes(elem.tagName.toUpperCase())){
        return elem;
    }

    if(!elem.parentElement)
        return;

    return retrieveElement(elem.parentElement)
}


let mouseX = 0;
let mouseY = 0;
document.addEventListener("mousemove", (e) => {
    // Update global mouse position
    mouseX = e.clientX;
    mouseY = e.clientY;

})

function hasDirectText(elem:HTMLElement) {
    return Array.from(elem.childNodes).some(
        node => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0
    );
}

function resetWorker(){
    llm=undefined;
    console.log('resetting worker');
    try {

        chrome.runtime.sendMessage({type: 'webllm-connection-lost', timestamp: Date.now()}, (response) => {
        console.log('Initilization again after connection lost event received:',response)
        init();
    });
    } catch (e) {
        console.error('Exception while sending message:', e);
        // Handle the exception
    }

}

