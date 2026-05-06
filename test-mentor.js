const API_KEY = "AIzaSyA1B3ljuYzYOt2eV6h2bAvgiJJ1QJ9tDYA"; // Use an environment variable in production!
const MODEL_NAME = "gemini-2.5-flash-lite";

async function testGemini() {
  // Updated URL to use the 2.5 Flash Lite model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

  const body = {
    contents: [
      {
        parts: [{ text: "Explain the benefits of using Flash-Lite for mobile apps." }]
      }
    ]
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    
    // Safety check for the response structure
    if (data.candidates && data.candidates[0].content) {
      console.log("Gemini Response:", data.candidates[0].content.parts[0].text);
    } else {
      console.error("Unexpected response format:", data);
    }
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

testGemini();