// Vulnerable Node.js app for testing ctf-artifact-analyze
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const app = express();
app.use(express.json());

app.get('/ping', (req, res) => {
    const host = req.query.host;
    exec(`ping -c 1 ${host}`, (err, stdout) => {  // Sink: command_injection
        res.send(stdout);
    });
});

app.get('/read', (req, res) => {
    const filePath = req.query.file;
    fs.readFile(filePath, 'utf8', (err, data) => {  // Sink: path_traversal
        res.send(data);
    });
});

app.get('/fetch', async (req, res) => {
    const url = req.query.url;
    const resp = await fetch(url);  // Sink: ssrf
    res.send(await resp.text());
});

const FLAG = "flag{test_flag_for_ctf_12345}";
