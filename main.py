from dotenv import load_dotenv 
from openai import OpenAI 
from flask import Flask, request, render_template, redirect, url_for, session, jsonify
from werkzeug.security import check_password_hash, generate_password_hash
from datetime import datetime, timezone
import json
import os
import threading

load_dotenv()
client = OpenAI() 

app = Flask(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
PROFILE_PATH = os.path.join(DATA_DIR, "profiles.json")
_profile_lock = threading.Lock()


def _load_secret():
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, "secret_key")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as handle:
            return handle.read().strip()
    key = os.urandom(24).hex()
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(key)
    return key


app.secret_key = _load_secret()


def _read_profiles():
    if not os.path.exists(PROFILE_PATH):
        return {}
    with open(PROFILE_PATH, encoding="utf-8") as handle:
        return json.load(handle)


def _write_profiles(profiles):
    os.makedirs(DATA_DIR, exist_ok=True)
    temporary = PROFILE_PATH + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(profiles, handle, indent=2)
    os.replace(temporary, PROFILE_PATH)


def create_profile(name, pin):
    key = name.casefold()
    with _profile_lock:
        profiles = _read_profiles()
        if key in profiles:
            return "That name already has a profile. Log in instead."
        profiles[key] = {
            "display_name": name,
            "pin_hash": generate_password_hash(pin),
            "tasks": [],
        }
        _write_profiles(profiles)
    return None


def authenticate(name, pin):
    key = name.casefold()
    with _profile_lock:
        profile = _read_profiles().get(key)
    if not profile:
        return None, "No profile uses that name yet."
    if not check_password_hash(profile["pin_hash"], pin):
        return None, "That PIN does not match this profile."
    return profile, None


def save_task(key, task):
    with _profile_lock:
        profiles = _read_profiles()
        profile = profiles.get(key)
        if not profile:
            return
        profile.setdefault("tasks", []).insert(0, task)
        profile["tasks"] = profile["tasks"][:15]
        _write_profiles(profiles)


def tasks_for(key):
    with _profile_lock:
        profile = _read_profiles().get(key) or {}
    return profile.get("tasks", [])


@app.context_processor
def inject_user():
    return {"current_user": session.get("user")}


@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == "POST":
        name = " ".join(request.form.get("name", "").split())
        pin = request.form.get("pin", "").strip()
        action = request.form.get("action")
        if len(name) < 2 or len(name) > 24:
            error = "Use a name between 2 and 24 characters."
        elif len(pin) < 4 or len(pin) > 12:
            error = "Use a PIN between 4 and 12 characters."
        elif action == "create":
            error = create_profile(name, pin)
            if error is None:
                session["user"] = name
                session["user_key"] = name.casefold()
                return redirect(url_for("index"))
        else:
            profile, error = authenticate(name, pin)
            if profile:
                session["user"] = profile["display_name"]
                session["user_key"] = name.casefold()
                return redirect(url_for("index"))
    return render_template("login.html", error=error)


@app.route('/logout', methods=['POST'])
def logout():
    session.pop("user", None)
    session.pop("user_key", None)
    return redirect(url_for("index"))


@app.route('/timer')
def timer():
    key = session.get("user_key")
    return render_template(
        "timer.html",
        tasks=tasks_for(key) if key else [],
        prefill=session.get("focus_task", ""),
    )


@app.route('/api/encouragement', methods=['POST'])
def encouragement():
    payload = request.get_json(silent=True) or {}
    task = str(payload.get("task") or "").strip()[:500]
    name = session.get("user") or ""
    history = "None yet."
    key = session.get("user_key")
    if key:
        past = []
        for item in tasks_for(key)[:5]:
            title = item.get("title") or "Task"
            description = (item.get("description") or "")[:240]
            past.append(f"- {title}: {description}")
        if past:
            history = "\n".join(past)

    lines = []
    try:
        completion = client.chat.completions.create(
            model="gpt-6-luna",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "You write short, warm encouragement for someone who is working through procrastination. You are specific to their task and never scolding.",
                },
                {
                    "role": "user",
                    "content": f"""
                        Name: {name or "the user"}
                        Current task: {task or "unspecified"}
                        Earlier tasks and descriptions:
                        {history}

                        Return JSON only, in this shape:
                        {{"lines": ["<short encouraging line>", "..."]}}
                        Give 8 lines. Each line is under 14 words, plain text, with no bullets and no HTML.
                    """,
                },
            ],
        )
        parsed = json.loads(completion.choices[0].message.content)
        lines = [str(line).strip() for line in parsed.get("lines", []) if str(line).strip()]
    except Exception:
        lines = []
    return jsonify(lines=lines[:8])


@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == "POST":
        # Extract data from the new index.html form
        task_description = request.form.get('task-description')
        end_date = request.form.get('end-date')
        
        # getlist() is used to capture all checked values from the checkboxes
        reasons = request.form.getlist('procrastination_reason')
        reasons_str = ", ".join(reasons) if reasons else "Unspecified reasons"
        
        reflection = request.form.get('reflection')
        
        # Call the language model to generate an action plan
        completion = client.chat.completions.create(
            model='gpt-6-luna', 
            response_format={'type': "json_object"},
            messages=[
                {"role": "system", "content": "You are a helpful, empathetic productivity coach assisting a user in overcoming procrastination."},
                {
                    "role": "user", 
                    "content": f"""
                        The user needs help stopping procrastination and getting started on a task.
                        Task & Avoidance: {task_description}
                        Target Completion Date: {end_date}
                        Reasons for Procrastination: {reasons_str}
                        User's Reflection: {reflection}
                        
                        Please provide a JSON response with the following format: 
                        {{"title": "<A catchy, motivational title for their action plan>", 
                        "advice": "<An empathetic, personalized plan in about 150 words>"}}

                        Format "advice" as plain text with real line breaks.
                        Start with one or two sentences of empathy.
                        Then put each action step on its own line, starting with "- ".
                        Do not put the steps in one paragraph, and do not use HTML.
                    """
                }
            ]
        )
        response = completion.choices[0].message.content
        data = json.loads(response)
        
        # Generate a motivational image based on their reasons
        image_response = client.images.generate(
            model='gpt-image-2.5-sunburst-2026-09-08',
            prompt=f"""
                A motivational banner image illustrating the concept of overcoming procrastination.
                Theme: Conquering feelings of {reasons_str} to finally start a task. 
                You should use a cartoon style, black and white framework. 
                Show a sense of relief, progress, and success.
            """,
            size="1024x1024",
            quality="low"
        )
        image_base64 = image_response.data[0].b64_json
        image_url = f"data:image/png;base64,{image_base64}"
        data['image'] = image_url

        session["focus_task"] = task_description or ""
        key = session.get("user_key")
        saved = False
        if key:
            save_task(key, {
                "title": data.get("title") or "",
                "description": task_description or "",
                "reasons": reasons_str,
                "reflection": reflection or "",
                "end_date": end_date or "",
                "saved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            })
            saved = True
        
        return render_template('destination.html', data=data, saved=saved)
    else: 
        return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)
