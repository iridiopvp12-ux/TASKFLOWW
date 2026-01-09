// Mock Global API_URL
const API_URL = "http://localhost:8000";

// Mock Functions from chat.js (pasted for testing logic)
function fixFileUrl(url) {
    if (!url) return url;
    if (url.startsWith('http') || url.startsWith('blob:')) return url;
    return `${API_URL}${url}`;
}

// Test Cases
const tests = [
    { input: "/uploads/file.png", expected: "http://localhost:8000/uploads/file.png" },
    { input: "http://example.com/file.png", expected: "http://example.com/file.png" },
    { input: "blob:d3958f5c-0777-0845-8dcd", expected: "blob:d3958f5c-0777-0845-8dcd" },
    { input: null, expected: null }
];

let errors = 0;
tests.forEach(t => {
    const res = fixFileUrl(t.input);
    if (res !== t.expected) {
        console.error(`FAIL: Input ${t.input} -> Expected ${t.expected}, got ${res}`);
        errors++;
    } else {
        console.log(`PASS: ${t.input} -> ${res}`);
    }
});

if (errors === 0) console.log("All URL fix tests passed.");
