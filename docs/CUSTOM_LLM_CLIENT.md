# Custom LLM Client Integration

## Overview

The CustomLLMClient has been successfully integrated into your ZenSmart Executor project. This client extends Stagehand's LLMClient to support custom API endpoints with OAuth authentication.

## Files Created

1. **`server/CustomLLMClient.ts`** - The main custom LLM client implementation
2. **`fetch_token.py`** - Python script for OAuth token fetching (needs configuration)

## How the CustomLLMClient Works

The CustomLLMClient provides:

- **OAuth Token Management**: Automatically fetches and refreshes OAuth tokens
- **Custom API Endpoint Support**: Connect to any custom LLM API endpoint
- **Retry Logic**: Automatic retry with token refresh on authentication failures
- **Structured Response Parsing**: Special handling for element/action responses
- **HTTPS Request Handling**: Native HTTPS request implementation

## Configuration Required

### 1. Update fetch_token.py

The `fetch_token.py` file is a template that needs to be customized for your OAuth provider. Edit the `fetch_token()` function to implement your specific authentication flow:

```python
def fetch_token():
    # Example: Replace with your OAuth implementation
    import requests
    
    response = requests.post(
        "https://your-auth-endpoint.com/token",
        data={
            "client_id": "your_client_id",
            "client_secret": "your_client_secret",
            "grant_type": "client_credentials"
        }
    )
    
    data = response.json()
    
    return {
        "access_token": data["access_token"],
        "baseURL": "https://your-api-endpoint.com/v1"  # Optional
    }
```

### 2. Using the CustomLLMClient in Your Application

To use the CustomLLMClient in your automation, update `server/automation.ts`:

```typescript
import { CustomLLMClient } from "./CustomLLMClient";

// In the initialize method:
const customClient = new CustomLLMClient({
  modelName: "gpt-4o",  // Stagehand model name for compatibility
  apiEndpoint: "https://your-api-endpoint.com/chat/completions",
  actualModelName: "gpt-4-1-2025-04-14-eastus-dz",  // Your actual model name
  apiKey: null  // null if using OAuth
});

this.stagehand = new Stagehand({
  env: "LOCAL",
  verbose: 1,
  cacheDir: "stagehand-cache",
  llmClient: customClient,  // Use custom client instead of default
});
```

### 3. Dependencies

Make sure Python 3 is installed in your environment if you're using the OAuth token fetcher:

```bash
python3 --version
```

If you need to install Python packages for OAuth (e.g., `requests`):

```bash
pip install requests
```

## API Endpoint Requirements

Your custom API endpoint should be compatible with the OpenAI chat completions format:

**Request:**
```json
{
  "model": "your-model-name",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**Response:**
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

## Advanced Features

### Structured Response Parsing

The CustomLLMClient includes special parsing logic for structured responses with element IDs and actions:

```typescript
// If your API returns structured data like:
{
  "element": {"id": "0-13"},
  "method": "click",
  "arguments": []
}

// It will be normalized automatically
```

### Token Refresh

If a request fails with a 401 Unauthorized error, the client will:
1. Clear the current token
2. Fetch a new token via `fetch_token.py`
3. Retry the request
4. Maximum 3 retry attempts

## Troubleshooting

### "Python script failed" Error

- Ensure `fetch_token.py` is executable: `chmod +x fetch_token.py`
- Check that Python 3 is available: `which python3`
- Verify your OAuth implementation returns valid JSON

### "Unauthorized – token expired" Error

- Your OAuth token may have expired
- Check your token endpoint is returning valid tokens
- Verify the token is being sent in the Authorization header

### Custom Endpoint Connection Issues

- Verify your API endpoint URL is correct
- Check SSL certificate validation (currently set to `rejectUnauthorized: false`)
- Ensure the endpoint accepts Bearer token authentication

## Next Steps

1. Implement your OAuth logic in `fetch_token.py`
2. Update `server/automation.ts` to use the CustomLLMClient
3. Test the integration with your custom API endpoint
4. Adjust model names and parameters as needed for your use case

## Support

For Stagehand-specific questions, refer to the [@browserbasehq/stagehand documentation](https://github.com/browserbase/stagehand).
