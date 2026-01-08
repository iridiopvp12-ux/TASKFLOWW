
import os
from playwright.sync_api import sync_playwright

def verify_dashboard_charts():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1920, "height": 1080})

        # Capture logs
        page.on("console", lambda msg: print(f"BROWSER LOG: {msg.text}"))

        cwd = os.getcwd()
        page.goto(f"file://{cwd}/frontend/index.html")
        page.wait_for_timeout(1000)

        # Force UI State and Inject Data Manually
        page.evaluate("""
            try {
                // Remove Login
                const login = document.getElementById('login-screen');
                if(login) login.remove();
                document.getElementById('app-container').style.display = 'flex';

                // Assign to existing global
                // We use window.currentUser if declared there, or implicit global assignment
                // We wrap in try-catch in case it's a const (unlikely)
                try {
                    currentUser = {id: 1, name: "Admin", role: "admin", sector_id: 1};
                } catch(e) {
                    // If const, we can't change it, but we can try window.currentUser
                    console.log("Could not assign currentUser directly: " + e);
                    window.currentUser = {id: 1, name: "Admin", role: "admin", sector_id: 1};
                }

                window.USERS = [{id: 1, name: "Admin", role: "admin", color: "#3b82f6"}];
                window.COMPANIES = [{id: 1, name: "Acme Corp"}];

                // Inject Data
                const today = new Date().toISOString().split('T')[0];
                const tasks = [];
                for(let i=0; i<10; i++) {
                    tasks.push({
                        id: i,
                        desc: `Task ${i}`,
                        status: 'done',
                        assignedTo: 1,
                        completedAt: today,
                        companyId: 1
                    });
                }
                window.TASKS = tasks;

                // Render
                if (typeof renderDashboard === 'function') {
                    renderDashboard();
                    console.log("Dashboard rendered.");
                } else {
                    console.error("renderDashboard not defined.");
                }

            } catch (e) {
                console.error("Eval Error: " + e.toString());
            }
        """)

        # Wait for charts to render
        try:
            page.wait_for_selector("#chart-weekly-canvas", timeout=5000)
            page.wait_for_timeout(2000)
            page.screenshot(path="verification/dashboard_charts.png")
            print("Screenshot taken at verification/dashboard_charts.png")
        except Exception as e:
            print(f"Screenshot failed: {e}")

        browser.close()

if __name__ == "__main__":
    verify_dashboard_charts()
