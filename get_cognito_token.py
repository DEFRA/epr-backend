# /// script
# requires-python = ">=3.12"
# dependencies = ["requests"]
# ///

import requests
import base64


def get_cognito_token(client_id, client_secret, token_url):
    client_credentials = f"{client_id}:{client_secret}"
    encoded_credentials = base64.b64encode(client_credentials.encode()).decode()
    headers = {
        "Authorization": f"Basic {encoded_credentials}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    payload = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }

    response = requests.post(f"{token_url}/oauth2/token", headers=headers, data=payload)
    response.raise_for_status()
    token_response = response.json()
    return token_response["access_token"]


if __name__ == "__main__":
    token = get_cognito_token(
        client_id="98a3r6tvcr1s08hulq0fh8pqu",
        client_secret="1g8lpglk1mh5hp8ujhoi3ptl7fb9s5aqvv1ig80vq3evhcrn5du5",
        token_url="https://something.auth.eu-west-2.amazoncognito.com",
    )
    print(token)
