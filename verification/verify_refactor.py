import requests
import json
import os
import sys

# Assume app is running on localhost:8000 for verification
BASE_URL = "http://localhost:8000"

def verify():
    print(">>> STARTING VERIFICATION <<<")

    # 1. Create a Task
    print("\n1. Creating Task...")
    payload = {
        "desc": "Verification Task",
        "status": "todo",
        "prio": "Alta",
        "dueDate": "2023-12-31",
        "assignedTo": None,
        "companyId": None,
        "subtasks": [{"text": "Subtask 1", "done": False}, {"text": "Subtask 2", "done": True}],
        "recurrence": "none",
        "recurrenceDay": None,
        "recurrenceActive": True,
        "sectorId": None
    }
    try:
        res = requests.post(f"{BASE_URL}/tasks", json=payload)
        res.raise_for_status()
        data = res.json()
        task_id = data['id']
        print(f"✅ Task created with ID: {task_id}")
    except Exception as e:
        print(f"❌ Failed to create task: {e}")
        return

    # 2. Verify Task & Subtasks (GET)
    print("\n2. Fetching Task to verify Subtasks...")
    try:
        res = requests.get(f"{BASE_URL}/tasks")
        res.raise_for_status()
        tasks = res.json()
        target = next((t for t in tasks if t['id'] == task_id), None)

        if not target:
            print("❌ Task not found in list!")
            return

        print(f"   Task Found: {target['desc']}")
        subs = target.get('subtasks', [])
        print(f"   Subtasks count: {len(subs)}")

        if len(subs) != 2:
            print("❌ Incorrect subtask count!")
        else:
            print("✅ Subtasks verified.")

    except Exception as e:
        print(f"❌ Failed to fetch tasks: {e}")

    # 3. Add Comment
    print("\n3. Adding Comment...")
    try:
        # Need a user ID, assuming admin (ID 1) exists or created
        comm_payload = {"text": "Test Comment Normalized", "authorId": 1}
        res = requests.post(f"{BASE_URL}/tasks/{task_id}/comments", json=comm_payload)
        res.raise_for_status()
        print("✅ Comment added.")
    except Exception as e:
        print(f"❌ Failed to add comment: {e}")

    # 4. Verify Comment (GET)
    print("\n4. Verifying Comment Persistence...")
    try:
        res = requests.get(f"{BASE_URL}/tasks")
        tasks = res.json()
        target = next((t for t in tasks if t['id'] == task_id), None)
        comments = target.get('comments', [])
        if len(comments) > 0 and comments[-1]['text'] == "Test Comment Normalized":
            print("✅ Comment persistence verified.")
        else:
            print(f"❌ Comment not found! Got: {comments}")
    except Exception as e:
        print(f"❌ Failed to verify comment: {e}")

    # 5. Update Task (PUT) - Test Subtask Sync
    print("\n5. Updating Task (Subtask Sync)...")
    try:
        # Remove one subtask, add another
        new_subs = [{"text": "Subtask 1", "done": True}, {"text": "Subtask 3 New", "done": False}]
        update_payload = {"subtasks": new_subs, "status": "doing"}
        res = requests.put(f"{BASE_URL}/tasks/{task_id}", json=update_payload)
        res.raise_for_status()
        print("✅ Update request successful.")

        # Verify
        res = requests.get(f"{BASE_URL}/tasks")
        tasks = res.json()
        target = next((t for t in tasks if t['id'] == task_id), None)
        subs = target.get('subtasks', [])

        texts = [s['text'] for s in subs]
        if "Subtask 3 New" in texts and len(subs) == 2:
             print("✅ Subtask sync verified (Delete/Insert strategy working).")
        else:
             print(f"❌ Subtask sync failed! Got: {texts}")

    except Exception as e:
        print(f"❌ Failed to update task: {e}")

if __name__ == "__main__":
    verify()
