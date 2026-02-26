# Prompt Architect - Local Setup Guide

Follow these steps to run the Prompt Architect application on your local machine.

## Prerequisites

1.  **Node.js**: Ensure you have Node.js installed (version 18 or higher is recommended).
    *   Download: [https://nodejs.org/](https://nodejs.org/)
    *   Verify: Run `node -v` in your terminal.

2.  **Ollama**: This app requires Ollama to run local LLMs.
    *   Download: [https://ollama.com/](https://ollama.com/)
    *   Install and run the Ollama application.
    *   Verify: Run `ollama --version` in your terminal.

## Installation

1.  **Unzip the file**: Extract the contents of the downloaded `.zip` file to a folder on your computer.

2.  **Open Terminal**: Open your command prompt (Windows) or terminal (Mac/Linux) and navigate to the extracted folder.
    ```bash
    cd path/to/extracted-folder
    ```

3.  **Install Dependencies**: Run the following command to install the required packages.
    ```bash
    npm install
    ```

## Running the App

1.  **Start the Development Server**:
    ```bash
    npm run dev
    ```

2.  **Open in Browser**:
    *   The terminal will show a local URL, usually `http://localhost:3000` (or similar).
    *   Open this URL in your web browser.

## Setting up Ollama Models

The app needs specific models to function correctly. You can either download them through the app's UI or manually via the terminal.

**Option A: Via the App (Recommended)**
1.  Open the app in your browser.
2.  In the "Model Configuration" section, select a target model (e.g., `dolphin-mistral`).
3.  Click the **"Download"** button if it appears.

**Option B: Manually via Terminal**
Run these commands in a separate terminal window to pull the recommended models:

```bash
ollama pull dolphin-mistral
ollama pull dolphin-llama3
ollama pull wizardlm-uncensored
```

## Troubleshooting

*   **"Ollama Connection Failed"**: Ensure Ollama is running in the background. By default, it runs on port `11434`.
*   **"CORS Errors"**: The app uses a proxy to avoid CORS issues, so ensure you are accessing the app via the `localhost` URL provided by `npm run dev`, not by opening the `index.html` file directly.

## License

Private / Personal Use
