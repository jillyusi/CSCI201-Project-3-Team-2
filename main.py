from dotenv import load_dotenv 
from openai import OpenAI 
from flask import Flask, request, render_template, redirect, url_for
import json

load_dotenv()
client = OpenAI() 

app = Flask(__name__)

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
        
        return render_template('destination.html', data=data)
    else: 
        return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)