# OAuth Integration Guide for ZenSmart Executor

## Overview

ZenSmart Executor now supports **OAuth-based authentication** for custom LLM endpoints. This allows you to use your own LLM API with OAuth client credentials flow instead of direct API keys.

---

## 🔒 Security Benefits

- **No API keys in code**: Credentials stored as Replit Secrets
- **Automatic token refresh**: Handles token expiration transparently
- **Retry logic**: Automatic retry on authentication failures
- **Separation of concerns**: Authentication logic isolated from automation code

---

## 🚀 Quick Start (2 Methods)

### Method 1: Standard LLM (API Keys) - **DEFAULT**

**Status**: ✅ Active by default

```bash
# Just set your API keys in Replit Secrets:
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
```

Your application will work immediately with OpenAI, Anthropic, or Gemini models.

---

### Method 2: Custom LLM with OAuth - **OPTIONAL**

**Status**: ⚙️ Requires configuration

Follow the steps below to enable OAuth authentication.

---

## 📋 Prerequisites

- Python 3 installed (already available in Replit)
- Access to a custom LLM API endpoint that accepts OAuth tokens
- OAuth client credentials (client ID and secret)

---

## 🔧 Setup Instructions

### Step 1: Set Environment Variables

Set these in your Replit environment (already configured as empty):

```bash
USE_CUSTOM_LLM=true
CUSTOM_LLM_API_ENDPOINT=https://your-api.example.com/chat/completions
CUSTOM_LLM_MODEL_NAME=gpt-4-1-2025-04-14-eastus-dz
```

### Step 2: Configure OAuth Secrets

Add these as **Replit Secrets** (NOT environment variables):

1. Open the **Secrets** tab in Replit
2. Add the following secrets:

```bash
OAUTH_CLIENT_ID=your_client_id_here
OAUTH_CLIENT_SECRET=your_client_secret_here
OAUTH_TOKEN_ENDPOINT=https://your-auth-server.com/oauth/token
```

### Step 3: Implement OAuth Logic in fetch_token.py

Edit `fetch_token.py` and uncomment **one of the three options**:

#### Option 1: Using requests library (Recommended)

```python
# Uncomment lines 41-67 in fetch_token.py
import requests

response = requests.post(
    oauth_token_endpoint,
    data={
        "client_id": oauth_client_id,
        "client_secret": oauth_client_secret,
        "grant_type": "client_credentials",
        "scope": "api"
    }
)

data = response.json()
return {
    "access_token": data["access_token"],
    "baseURL": os.getenv("CUSTOM_LLM_API_ENDPOINT")
}
```

**Install requests** (if needed):
```bash
pip install requests
```

#### Option 2: Using urllib (No dependencies)

```python
# Uncomment lines 70-96 in fetch_token.py
import urllib.request
import urllib.parse

# See fetch_token.py for full implementation
```

#### Option 3: Static Token (Testing only)

```python
# Uncomment lines 99-107 in fetch_token.py
# Add OAUTH_STATIC_TOKEN to Replit Secrets

static_token = os.getenv("OAUTH_STATIC_TOKEN")
return {
    "access_token": static_token,
    "baseURL": os.getenv("CUSTOM_LLM_API_ENDPOINT")
}
```

### Step 4: Test the Integration

```bash
# Test OAuth token fetching
python fetch_token.py
```

Expected output:
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6...",
  "baseURL": "https://your-api.example.com"
}
```

### Step 5: Restart the Application

The workflow will automatically restart. Check logs for:
```
[custom-llm] Fetched OAuth token
[automation] Custom LLM Client created with OAuth authentication
[automation] Browser automation initialized with caching enabled
```

---

## ✅ Feature Compatibility

All ZenSmart Executor features work with OAuth mode:

| Feature | Standard Mode (API Keys) | OAuth Mode (Custom LLM) |
|---------|--------------------------|------------------------|
| **Act** (single actions) | ✅ Supported | ✅ Supported |
| **Act** (multi-step) | ✅ Supported | ✅ Supported |
| **Extract** (data extraction) | ✅ Supported | ✅ Supported |
| **Observe** (element discovery) | ✅ Supported | ✅ Supported |
| **Agent** (autonomous workflows) | ✅ Supported | ✅ Supported |
| **WebSocket logging** | ✅ Supported | ✅ Supported |
| **Caching** | ✅ Supported | ✅ Supported |

**No feature limitations** - OAuth mode provides full functionality!

---

## 🎯 How It Works

### Authentication Flow

```
┌─────────────────┐
│  Start Automation│
└────────┬─────────┘
         │
         ▼
   ┌─────────────────┐
   │ USE_CUSTOM_LLM? │
   └────────┬─────────┘
            │
     ┌──────┴──────┐
     │             │
    YES           NO
     │             │
     ▼             ▼
┌──────────┐  ┌──────────────┐
│CustomLLM │  │Standard Model│
│+ OAuth   │  │+ API Key     │
└─────┬────┘  └──────────────┘
      │
      ▼
┌─────────────────┐
│fetch_token.py   │
│executes         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│OAuth Provider   │
│returns token    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│Token stored in  │
│CustomLLMClient  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│All API requests │
│use Bearer token │
└─────────────────┘
```

### Token Lifecycle

1. **First Request**: CustomLLMClient checks if token exists → No → Calls `fetch_token.py`
2. **Subsequent Requests**: Uses cached token
3. **Token Expired (401)**: Clears token → Calls `fetch_token.py` → Retries request
4. **Max Retries (3)**: Throws error if authentication continues to fail

---

## 🔍 Troubleshooting

### Error: "OAuth credentials not configured"

**Problem**: Replit Secrets not set

**Solution**:
```bash
# Add to Replit Secrets tab:
OAUTH_CLIENT_ID
OAUTH_CLIENT_SECRET
OAUTH_TOKEN_ENDPOINT
```

### Error: "Python script failed"

**Problem**: fetch_token.py implementation not active

**Solution**: Edit `fetch_token.py` and uncomment one of the OPTION blocks

### Error: "Unauthorized – token expired or invalid"

**Problem**: OAuth token is invalid or expired

**Solution**: 
- Verify your OAuth credentials are correct
- Check that your token endpoint is returning valid tokens
- Try the static token option (OPTION 3) for testing

### Error: "CUSTOM_LLM_API_ENDPOINT environment variable is required"

**Problem**: OAuth mode enabled but endpoint not configured

**Solution**:
```bash
# Set in environment variables:
CUSTOM_LLM_API_ENDPOINT=https://your-api.example.com/chat/completions
```

---

## 📊 Environment Variables Reference

### Standard Mode (Default)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `USE_CUSTOM_LLM` | No | `false` | Enable OAuth mode |
| `OPENAI_API_KEY` | Yes* | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | Yes* | - | Anthropic API key |
| `GEMINI_API_KEY` | Yes* | - | Google Gemini API key |

\* At least one API key required

### OAuth Mode

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `USE_CUSTOM_LLM` | Yes | `false` | Set to `true` |
| `CUSTOM_LLM_API_ENDPOINT` | Yes | - | Your API endpoint URL |
| `CUSTOM_LLM_MODEL_NAME` | No | `gpt-4-1-2025-04-14-eastus-dz` | Actual model name |

### OAuth Secrets (Replit Secrets tab)

| Secret | Required | Description |
|--------|----------|-------------|
| `OAUTH_CLIENT_ID` | Yes | OAuth client ID |
| `OAUTH_CLIENT_SECRET` | Yes | OAuth client secret |
| `OAUTH_TOKEN_ENDPOINT` | Yes | OAuth token URL |
| `OAUTH_STATIC_TOKEN` | No | Static token (testing only) |

---

## 🎨 Example Configurations

### Example 1: Azure OpenAI with OAuth

```bash
# Environment Variables
USE_CUSTOM_LLM=true
CUSTOM_LLM_API_ENDPOINT=https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2024-02-01
CUSTOM_LLM_MODEL_NAME=gpt-4

# Replit Secrets
OAUTH_CLIENT_ID=your_azure_client_id
OAUTH_CLIENT_SECRET=your_azure_client_secret
OAUTH_TOKEN_ENDPOINT=https://login.microsoftonline.com/your-tenant-id/oauth2/v2.0/token
```

**fetch_token.py** (Option 1):
```python
# Uncomment OPTION 1 and adjust scope:
"scope": "https://cognitiveservices.azure.com/.default"
```

### Example 2: Custom LLM Provider

```bash
# Environment Variables
USE_CUSTOM_LLM=true
CUSTOM_LLM_API_ENDPOINT=https://api.customllm.com/v1/chat/completions
CUSTOM_LLM_MODEL_NAME=custom-model-v2

# Replit Secrets
OAUTH_CLIENT_ID=cli_abc123
OAUTH_CLIENT_SECRET=sec_xyz789
OAUTH_TOKEN_ENDPOINT=https://auth.customllm.com/oauth/token
```

### Example 3: Testing with Static Token

```bash
# Environment Variables
USE_CUSTOM_LLM=true
CUSTOM_LLM_API_ENDPOINT=https://api.test.com/chat/completions

# Replit Secrets
OAUTH_STATIC_TOKEN=your_test_token_here
```

**fetch_token.py**: Uncomment OPTION 3

---

## 🔄 Switching Between Modes

### Switch to OAuth Mode

```bash
USE_CUSTOM_LLM=true
```

Restart workflow → Application uses OAuth

### Switch to Standard Mode

```bash
USE_CUSTOM_LLM=false
```

Restart workflow → Application uses API keys

---

## 📝 API Endpoint Requirements

Your custom LLM API must:

1. **Accept Bearer token authentication**:
   ```
   Authorization: Bearer <token>
   ```

2. **Use OpenAI-compatible request format**:
   ```json
   {
     "model": "your-model-name",
     "messages": [...],
     "temperature": 0.7,
     "max_tokens": 1000
   }
   ```

3. **Return OpenAI-compatible response**:
   ```json
   {
     "choices": [{"message": {"role": "assistant", "content": "..."}}],
     "usage": {"total_tokens": 100}
   }
   ```

---

## ✅ Verification Checklist

Before going live with OAuth:

- [ ] OAuth credentials set in Replit Secrets
- [ ] `fetch_token.py` implemented (one OPTION uncommented)
- [ ] `USE_CUSTOM_LLM=true` set
- [ ] `CUSTOM_LLM_API_ENDPOINT` configured
- [ ] Test token fetching: `python fetch_token.py`
- [ ] Workflow restarted
- [ ] Check logs for "OAuth token fetched"
- [ ] Test automation with sample prompt

---

## 🚨 Security Best Practices

1. **Never commit OAuth credentials** to git
2. **Use Replit Secrets** for all sensitive data
3. **Rotate tokens regularly** if your provider supports it
4. **Use HTTPS only** for all API endpoints
5. **Monitor token usage** for suspicious activity
6. **Set appropriate token scopes** (principle of least privilege)

---

## 🆘 Support

- **Stagehand Documentation**: https://docs.stagehand.dev
- **CustomLLMClient Implementation**: `server/CustomLLMClient.ts`
- **OAuth Template**: `fetch_token.py`
- **Integration Code**: `server/automation.ts` (lines 64-96)

---

## 📚 Related Documentation

- [Custom LLM Client Integration](./CUSTOM_LLM_CLIENT.md)
- [Stagehand Gap Analysis](./STAGEHAND_GAP_ANALYSIS.md)
- [Project Migration Summary](../MIGRATION_SUMMARY.md)

---

**Last Updated**: November 23, 2025  
**Integration Status**: ✅ Complete and Ready for Configuration
