#!/usr/bin/env python3
"""
OAuth Token Fetcher for Custom LLM Client
This script fetches an OAuth access token for authenticating with a custom LLM API endpoint.

SECURITY: Store OAuth credentials as Replit Secrets (not in code)
Required secrets (if using OAuth):
  - OAUTH_CLIENT_ID
  - OAUTH_CLIENT_SECRET
  - OAUTH_TOKEN_ENDPOINT
"""

import json
import sys
import os

def fetch_token():
    """
    Fetch OAuth token from your authentication service.
    
    This template shows how to implement OAuth client credentials flow.
    Modify based on your OAuth provider's requirements.
    
    Returns:
        dict: Contains 'access_token' and optionally 'baseURL'
    """
    
    try:
        # Get OAuth configuration from environment variables (Replit Secrets)
        oauth_client_id = os.getenv("OAUTH_CLIENT_ID")
        oauth_client_secret = os.getenv("OAUTH_CLIENT_SECRET")
        oauth_token_endpoint = os.getenv("OAUTH_TOKEN_ENDPOINT")
        
        # Check if OAuth is configured
        if not all([oauth_client_id, oauth_client_secret, oauth_token_endpoint]):
            return {
                "error": "OAuth credentials not configured. Please set OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, and OAUTH_TOKEN_ENDPOINT as Replit Secrets."
            }
        
        # OPTION 1: Using requests library (recommended)
        # Uncomment and install: pip install requests
        """
        import requests
        
        response = requests.post(
            oauth_token_endpoint,
            data={
                "client_id": oauth_client_id,
                "client_secret": oauth_client_secret,
                "grant_type": "client_credentials",
                "scope": "api"  # Adjust scope as needed
            },
            headers={
                "Content-Type": "application/x-www-form-urlencoded"
            }
        )
        
        if response.status_code != 200:
            return {
                "error": f"OAuth token request failed: {response.status_code} - {response.text}"
            }
        
        data = response.json()
        return {
            "access_token": data["access_token"],
            "baseURL": os.getenv("CUSTOM_LLM_API_ENDPOINT")  # Optional
        }
        """
        
        # OPTION 2: Using urllib (no external dependencies)
        # Uncomment to use:
        """
        import urllib.request
        import urllib.parse
        
        data = urllib.parse.urlencode({
            "client_id": oauth_client_id,
            "client_secret": oauth_client_secret,
            "grant_type": "client_credentials",
            "scope": "api"
        }).encode('utf-8')
        
        req = urllib.request.Request(
            oauth_token_endpoint,
            data=data,
            headers={
                "Content-Type": "application/x-www-form-urlencoded"
            }
        )
        
        with urllib.request.urlopen(req) as response:
            response_data = json.loads(response.read().decode('utf-8'))
            return {
                "access_token": response_data["access_token"],
                "baseURL": os.getenv("CUSTOM_LLM_API_ENDPOINT")
            }
        """
        
        # OPTION 3: Static token (for testing only - NOT RECOMMENDED for production)
        # Uncomment to use a static token from environment variable:
        """
        static_token = os.getenv("OAUTH_STATIC_TOKEN")
        if static_token:
            return {
                "access_token": static_token,
                "baseURL": os.getenv("CUSTOM_LLM_API_ENDPOINT")
            }
        """
        
        # Default: Return error if no implementation is active
        return {
            "error": "fetch_token.py needs implementation. Uncomment one of the OPTION blocks above and configure your OAuth provider."
        }
        
    except Exception as e:
        return {
            "error": f"OAuth token fetch failed: {str(e)}"
        }

if __name__ == "__main__":
    result = fetch_token()
    print(json.dumps(result))
    sys.exit(0 if "error" not in result else 1)
