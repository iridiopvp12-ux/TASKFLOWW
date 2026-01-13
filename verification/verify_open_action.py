from playwright.sync_api import sync_playwright
import os
import json

def run(playwright):
    browser = playwright.chromium.launch(headless=True, args=["--disable-web-security"])
    page = browser.new_page()

    # Mock localStorage
    user_json = json.dumps({"id": 1, "name": "Test User", "role": "admin"})
    page.add_init_script(f"localStorage.setItem('tf_user', '{user_json}');")

    # Define route handler
    def handle_route(route):
        url = route.request.url
        if "chat/rooms" in url:
            route.fulfill(status=200, body=json.dumps([]), headers={'content-type': 'application/json'})
        elif "chat/messages" in url:
             route.fulfill(status=200, body=json.dumps([]), headers={'content-type': 'application/json'})
        else:
            route.continue_()

    page.route("**/*", handle_route)

    cwd = os.getcwd()
    file_url = f"file://{cwd}/frontend/index.html"
    page.goto(file_url)

    # Switch to chat
    page.evaluate("switchView('chat')")
    page.wait_for_timeout(1000)

    # Inject a manual trigger for handleOpenFile since we can't easily click a file in the component without it being rendered with data
    # We will manually dispatch the event on the component

    page.evaluate("""
        const component = document.getElementById('chat-component');
        const file = { name: 'test.pdf', url: 'http://example.com/test.pdf' };
        // Dispatch CustomEvent expected by listener
        // The listener was added with: chatComponent.addEventListener('open-file', handleOpenFile);
        // And handleOpenFile reads event.detail[0] || event.detail

        // vue-advanced-chat emits CustomEvent
        const event = new CustomEvent('open-file', { detail: { file: file } });
        component.dispatchEvent(event);
    """)

    # Check if Toast appeared
    try:
        page.wait_for_selector(".toast-info", timeout=3000)
        print("Toast appeared: Success")

        # Check if text matches
        text = page.locator(".toast-info").text_content()
        if "Abrindo test.pdf" in text:
            print(f"Toast text correct: {text}")
        else:
             print(f"Toast text mismatch: {text}")

    except Exception as e:
        print(f"Toast did not appear: {e}")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
