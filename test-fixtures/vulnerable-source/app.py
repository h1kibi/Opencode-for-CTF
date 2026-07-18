"""Vulnerable Flask app for testing ctf-artifact-analyze"""
import os
import subprocess
import pickle
from flask import Flask, request

app = Flask(__name__)

@app.route('/execute')
def command_injection():
    cmd = request.args.get('cmd')
    result = os.system(cmd)  # Sink: command_injection
    return f"Executed: {result}"

@app.route('/exec')
def command_injection2():
    user_input = request.args.get('input')
    result = subprocess.call(user_input, shell=True)  # Sink: command_injection
    return f"Result: {result}"

@app.route('/eval')
def code_injection():
    expr = request.args.get('expr')
    result = eval(expr)  # Sink: code_injection
    return f"Result: {result}"

@app.route('/render')
def ssti():
    template = request.args.get('tpl')
    from flask import render_template_string
    return render_template_string(template)  # Sink: ssti

API_KEY = "sk-abc123def456"
SECRET_TOKEN = "super_secret_token_12345"
