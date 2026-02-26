export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaTagResponse {
  models: OllamaModel[];
}

export interface GenerationResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export const DEFAULT_OLLAMA_URL = '/ollama'; // Proxied to http://127.0.0.1:11434

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    // Handle 500 errors which might mean Ollama is down or misconfigured
    if (response.status === 500) {
       throw new Error('Ollama Server Error (500). Ensure Ollama is running and the model is installed correctly.');
    }
    throw new Error(`Ollama API Error: ${response.status} ${response.statusText}`);
  }
  
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    if (text.includes('<!doctype html>') || text.includes('<!DOCTYPE html>')) {
      throw new Error('Connection failed: Received HTML instead of JSON. Ensure Ollama is running locally on port 11434. If you are using the cloud preview, you cannot connect to localhost directly - please enable Demo Mode.');
    }
    throw new Error(`Invalid response format: ${contentType}`);
  }
  
  return response.json();
};

export const getInstalledModels = async (baseUrl: string = DEFAULT_OLLAMA_URL): Promise<OllamaModel[]> => {
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    return await handleResponse(response).then(data => data.models);
  } catch (error: any) {
    // Suppress logging for expected connection errors that are handled by the UI
    if (!error.message.includes('500') && 
        !error.message.includes('Connection failed') &&
        !error.message.includes('Cloud Preview')) {
      console.error('Error fetching models:', error);
    }
    throw error;
  }
};

export const pullModel = async (
  modelName: string,
  onProgress: (data: { progress: number; status: string; completed?: number; total?: number }) => void,
  baseUrl: string = DEFAULT_OLLAMA_URL,
  signal?: AbortSignal
): Promise<void> => {
  const response = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName }),
    signal,
  });

  if (!response.body) throw new Error('ReadableStream not supported');

  // If the initial response is not OK or not JSON/stream, handleResponse might catch it, 
  // but for streams we need to be careful. 
  // Ollama pull returns a stream of JSON objects.
  if (!response.ok) {
     // Try to read error message
     const text = await response.text();
     if (text.includes('<!doctype html>') || text.includes('<!DOCTYPE html>')) {
       throw new Error('Connection failed: Received HTML instead of JSON. Ensure Ollama is running locally on port 11434. If you are using the cloud preview, you cannot connect to localhost directly - please enable Demo Mode.');
     }
     throw new Error(`Pull failed: ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter((line) => line.trim() !== '');

    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.error) {
            throw new Error(json.error);
        }
        if (json.total && json.completed) {
          const progress = Math.round((json.completed / json.total) * 100);
          onProgress({
            progress,
            status: json.status,
            completed: json.completed,
            total: json.total
          });
        } else {
          onProgress({
            progress: 0,
            status: json.status
          });
        }
      } catch (e) {
        console.error('Error parsing JSON chunk', e);
      }
    }
  }
};

export const generatePromptStream = async function* (
  model: string,
  systemPrompt: string,
  userPrompt: string,
  baseUrl: string = DEFAULT_OLLAMA_URL
): AsyncGenerator<string, void, unknown> {
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      stream: true,
      keep_alive: 0, 
    }),
  });

  if (!response.ok) {
    if (response.status === 500) {
       throw new Error('Ollama Server Error (500). Ensure Ollama is running and the model is installed correctly.');
    }
    throw new Error(`Ollama API Error: ${response.status} ${response.statusText}`);
  }

  if (!response.body) throw new Error('ReadableStream not supported');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter((line) => line.trim() !== '');

    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.error) {
          throw new Error(json.error);
        }
        if (json.response) {
          yield json.response;
        }
        if (json.done) {
          return;
        }
      } catch (e) {
        console.error('Error parsing JSON chunk', e);
      }
    }
  }
};

export const generatePrompt = async (
  model: string,
  systemPrompt: string,
  userPrompt: string,
  baseUrl: string = DEFAULT_OLLAMA_URL
): Promise<GenerationResponse> => {
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      keep_alive: 0, // CRITICAL: Unload model immediately
    }),
  });

  return handleResponse(response);
};

// --- MOCK / DEMO MODE UTILITIES ---

export const mockInstalledModels: OllamaModel[] = [
  {
    name: 'dolphin-mistral:latest',
    modified_at: new Date().toISOString(),
    size: 4100000000,
    digest: 'sha256:mock1',
    details: { format: 'gguf', family: 'llama', families: ['llama'], parameter_size: '7B', quantization_level: 'Q4_0' }
  },
  {
    name: 'wizardlm-uncensored:latest',
    modified_at: new Date().toISOString(),
    size: 7000000000,
    digest: 'sha256:mock2',
    details: { format: 'gguf', family: 'llama', families: ['llama'], parameter_size: '13B', quantization_level: 'Q4_0' }
  }
];

export const mockGeneratePromptStream = async function* (
  model: string,
  systemPrompt: string,
  userPrompt: string
): AsyncGenerator<string, void, unknown> {
  // Simulate model loading delay
  yield ""; // Initial yield to signal start
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const response = `## [DEMO MODE] Generated Prompt

**Subject:** ${userPrompt}

## Subject: Detailed Character
- **Body Type:** Athletic, imposing
- **Facial expressions:** Stoic, intense gaze

## Action/Scene: Dynamic Composition
- **Outfit:** Tactical gear, weathered texture
- **Accessories:** Cybernetic implants, glowing accents

## Background: Atmospheric Setting
- **Description:** Dystopian city street, rain-slicked pavement
- **Lighting:** Neon signs reflecting on wet surfaces, volumetric fog

---

${userPrompt}, tactical gear, cybernetic implants, dystopian city, neon lighting, volumetric fog, 8k, masterpiece, cinematic lighting, highly detailed`;

  const chunks = response.split(' ');
  for (const chunk of chunks) {
    await new Promise(resolve => setTimeout(resolve, 50)); // Simulate token generation
    yield chunk + " ";
  }
};

export const mockGeneratePrompt = async (
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<GenerationResponse> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  return {
    model: model,
    created_at: new Date().toISOString(),
    response: `## [DEMO MODE] Generated Prompt

**Subject:** ${userPrompt}

## Subject: Detailed Character
- **Body Type:** Athletic, imposing
- **Facial expressions:** Stoic, intense gaze

## Action/Scene: Dynamic Composition
- **Outfit:** Tactical gear, weathered texture
- **Accessories:** Cybernetic implants, glowing accents

## Background: Atmospheric Setting
- **Description:** Dystopian city street, rain-slicked pavement
- **Lighting:** Neon signs reflecting on wet surfaces, volumetric fog

---

${userPrompt}, tactical gear, cybernetic implants, dystopian city, neon lighting, volumetric fog, 8k, masterpiece, cinematic lighting, highly detailed`,
    done: true,
    total_duration: 1500000000,
    load_duration: 100000000,
    prompt_eval_count: 50,
    eval_count: 200
  };
};
