from playwright.sync_api import sync_playwright
import os
import json

def run(playwright):
    # Launch with web security disabled to allow file:// fetch
    browser = playwright.chromium.launch(headless=True, args=["--disable-web-security"])
    page = browser.new_page()

    # Mock localStorage
    user_json = json.dumps({"id": 1, "name": "Test User", "role": "admin"})
    page.add_init_script(f"localStorage.setItem('tf_user', '{user_json}');")

    # Define route handler
    def handle_route(route):
        url = route.request.url
        # print(f"Request: {url}")
        if "chat/rooms" in url:
            rooms = [{
                "roomId": "123",
                "roomName": "Test Room",
                "avatar": "https://via.placeholder.com/50",
                "users": [{"_id": "2", "username": "Other", "status": {"state": "online"}}],
                "unreadCount": 0
            }]
            route.fulfill(status=200, body=json.dumps(rooms), headers={'content-type': 'application/json'})
        elif "chat/messages" in url:
            msgs = [{
                "_id": "1",
                "content": "Hello",
                "senderId": "2",
                "username": "Other",
                "date": "2023-10-27",
                "timestamp": "10:00",
                "files": [{
                    "name": "document.pdf",
                    "size": 1000,
                    "type": "file",
                    "extension": "pdf",
                    "url": "http://example.com/uploads/document.pdf"
                }]
            }]
            route.fulfill(status=200, body=json.dumps(msgs), headers={'content-type': 'application/json'})
        elif "favicon" in url:
            route.abort()
        else:
            route.continue_()

    page.route("**/*", handle_route)

    cwd = os.getcwd()
    file_url = f"file://{cwd}/frontend/index.html"
    page.goto(file_url)

    # Switch to chat view
    # Wait for main.js to load
    page.wait_for_timeout(2000) # Give some time for scripts to init

    # Inject switchView call
    page.evaluate("switchView('chat')")

    # Wait for component
    try:
        page.wait_for_selector("vue-advanced-chat", timeout=5000)
        print("Chat component found")
    except Exception as e:
        print(f"Chat component NOT found: {e}")

    # Wait a bit for rendering
    page.wait_for_timeout(2000)

    # Take screenshot
    page.screenshot(path="verification/chat_verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
