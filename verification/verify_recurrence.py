
import os
from playwright.sync_api import sync_playwright

def verify_recurrence_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # 1920x1080 to ensure sidebar visibility
        page = browser.new_page(viewport={"width": 1920, "height": 1080})

        # Capture logs
        page.on("console", lambda msg: print(f"BROWSER LOG: {msg.text}"))
        page.on("pageerror", lambda err: print(f"BROWSER ERROR: {err}"))

        cwd = os.getcwd()
        page.goto(f"file://{cwd}/frontend/index.html")

        # Give scripts time to parse
        page.wait_for_timeout(1000)

        # Force UI State and Inject Data Manually
        page.evaluate("""
            try {
                // 1. Remove Login
                const login = document.getElementById('login-screen');
                if(login) login.remove();
                document.getElementById('app-container').style.display = 'flex';
                window.currentUser = {id: 1, name: "Admin", role: "admin", sector_id: 1};

                // 2. Disable loadRecurrentTasks side effects so it doesn't overwrite us
                window.loadRecurrentTasks = function() { console.log("loadRecurrentTasks mocked"); };

                // 3. Switch to Recurrence View
                if (typeof switchView === 'function') {
                    switchView('recurrence');
                }

                // 4. Mock Data
                const tasks = [
                    {
                        "id": 101,
                        "desc": "Master Task Monthly",
                        "status": "todo",
                        "assignedTo": 1,
                        "recurrence": "monthly",
                        "recurrenceDay": 5,
                        "recurrenceActive": true,
                        "companyName": "Acme Corp",
                        "userName": "Admin"
                    },
                    {
                        "id": 102,
                        "desc": "Master Task Weekly Paused",
                        "status": "todo",
                        "assignedTo": 1,
                        "recurrence": "weekly",
                        "recurrenceDay": 0,
                        "recurrenceActive": false,
                        "companyName": "Acme Corp",
                        "userName": "User"
                    }
                ];

                // 5. Manually Render
                if (typeof renderRecurrenceRow === 'function') {
                    const list = document.getElementById('recurrence-list');
                    if(list) {
                        list.innerHTML = '';
                        tasks.forEach(t => {
                            list.appendChild(renderRecurrenceRow(t));
                        });
                        console.log("Rendered tasks manually.");
                    } else {
                        console.error("List container not found");
                    }
                } else {
                    console.error("renderRecurrenceRow is not defined.");
                }
            } catch (e) {
                console.error("Eval Error: " + e.toString());
            }
        """)

        # Wait for rendering
        page.wait_for_selector("#recurrence-list .data-item", timeout=5000)

        # Take screenshot
        page.screenshot(path="verification/recurrence_view.png")
        print("Screenshot taken at verification/recurrence_view.png")
        browser.close()

if __name__ == "__main__":
    verify_recurrence_ui()
