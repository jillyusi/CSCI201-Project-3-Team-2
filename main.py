import os
import json
from dotenv import load_dotenv 
from openai import OpenAI 
from flask import Flask, request, render_template, jsonify

load_dotenv()
client = OpenAI() 

app = Flask(__name__)

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/plan', methods=['POST'])
def generate_plan():
    task_description = request.form.get('task-description')
    user_feeling = request.form.get('user_feeling')
    coach_tone = request.form.get('coach_tone')
    
    completion = client.chat.completions.create(
        model='gpt-6-luna', 
        response_format={'type': "json_object"},
        messages=[
            {"role": "system", "content": f"You are a productivity coach. Your persona and tone must be: {coach_tone}. Output ONLY valid JSON."},
            {
                "role": "user", 
                "content": f"""
                    Task: {task_description}
                    User's described feelings: {user_feeling}
                    
                    Provide a JSON response with this exact structure: 
                    {{
                        "title": "A brief, motivational title in your persona's tone", 
                        "detected_blocker": "One sentence identifying their core blocker based on their feelings, spoken in your persona's tone.",
                        "steps": ["Step 1 text", "Step 2 text", "Step 3 text"]
                    }}
                """
            }
        ]
    )
    
    data = json.loads(completion.choices[0].message.content)
    data['task_context'] = task_description 
    data['coach_tone'] = coach_tone 
    
    return render_template('destination.html', data=data)

@app.route('/api/revise', methods=['POST'])
def revise_step():
    req_data = request.json
    original_step = req_data.get('step')
    feedback = req_data.get('feedback')
    task_context = req_data.get('task_context')
    coach_tone = req_data.get('coach_tone', 'Empathetic')
    
    completion = client.chat.completions.create(
        model='gpt-6-luna',
        response_format={'type': "json_object"},
        messages=[
            {"role": "system", "content": f"You are a productivity coach modifying a plan. Your persona tone is: {coach_tone}. Output ONLY JSON."},
            {
                "role": "user", 
                "content": f"""
                    Overall task: {task_context}
                    The user rejected this proposed step: "{original_step}"
                    User's reason for rejecting it: "{feedback}"
                    
                    Provide a much smaller, easier, or alternative revised step in JSON format matching your tone:
                    {{ "revised_step": "new step text" }}
                """
            }
        ]
    )
    return jsonify(json.loads(completion.choices[0].message.content))

# Required by timer.js to fetch lines while the timer is running
@app.route('/api/encouragement', methods=['POST'])
def encouragement():
    req_data = request.json
    task = req_data.get('task', 'your task')
    
    completion = client.chat.completions.create(
        model='gpt-6-luna',
        response_format={'type': "json_object"},
        messages=[
            {"role": "system", "content": "You are a productivity coach. Output ONLY valid JSON containing a single key 'lines' with an array of 4 short, encouraging sentences."},
            {"role": "user", "content": f"The user is working on: {task}. Give me 4 short sentences to cycle through during their focus timer."}
        ]
    )
    return jsonify(json.loads(completion.choices[0].message.content))

if __name__ == '__main__':
    app.run(debug=True)