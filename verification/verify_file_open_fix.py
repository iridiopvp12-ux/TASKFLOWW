from playwright.sync_api import sync_playwright
import os
import json

def run(playwright):
    browser = playwright.chromium.launch(headless=True, args=["--disable-web-security"])
    page = browser.new_page()

    # Mock localStorage
    user_json = json.dumps({"id": 1, "name": "Test User", "role": "admin"})
    page.add_init_script(f"localStorage.setItem('tf_user', '{user_json}');")

    # Define route handler to mock API
    def handle_route(route):
        url = route.request.url
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
        else:
            route.continue_()

    page.route("**/*", handle_route)

    # Capture console logs to check for errors
    console_errors = []
    def on_console(msg):
        if msg.type == "error":
            console_errors.append(msg.text)
            print(f"Console Error: {msg.text}")

    page.on("console", on_console)

    cwd = os.getcwd()
    file_url = f"file://{cwd}/frontend/index.html"
    page.goto(file_url)

    # Wait for init
    page.wait_for_timeout(2000)

    # Switch to chat view
    page.evaluate("switchView('chat')")

    # Wait for component to appear
    try:
        page.wait_for_selector("vue-advanced-chat", state="visible", timeout=5000)
        print("Chat component is visible")

        # Check if it has dimensions
        bbox = page.locator("vue-advanced-chat").bounding_box()
        if bbox and bbox['width'] > 0 and bbox['height'] > 0:
            print(f"Chat component dimensions: {bbox}")
        else:
            print("Chat component has 0 dimensions!")

        # Verify no critical errors
        if any("vue-advanced-chat" in err for err in console_errors):
             print("Found vue-advanced-chat errors in console!")
        else:
             print("No vue-advanced-chat errors found.")

    except Exception as e:
        print(f"Verification failed: {e}")

    # Take screenshot
    page.screenshot(path="verification/chat_fix_verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
