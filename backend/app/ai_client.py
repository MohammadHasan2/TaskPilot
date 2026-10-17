import os

from dotenv import load_dotenv
from groq import Groq

load_dotenv()


def generate_text(prompt: str, fallback_text: str) -> dict:
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

    # Allow local development without an API key.
    if not api_key:
        return {
            "text": fallback_text,
            "provider": "local_fallback",
            "model": None,
        }

    client = Groq(api_key=api_key)

    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an agent in TaskPilot. "
                    "Be precise, structured, and honest about uncertainty. "
                    "Do not invent facts or claim external research "
                    "was performed when it was not."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        max_tokens=700,
    )

    text = response.choices[0].message.content

    if not text or not text.strip():
        raise RuntimeError("Groq returned an empty response.")

    return {
        "text": text.strip(),
        "provider": "groq",
        "model": model,
    }