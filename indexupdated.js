const express = require('express');
const qrImage = require('qr-image');
const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid'); 
const app = express();

const sessionSchema = new mongoose.Schema({
    username: String,
    sessionID: String,
    active: Boolean,
    createdAt: { type: Date, default: Date.now }
});
sessionSchema.virtual('createdAtIST').get(function() {
    const offset = 330; // Offset for IST (GMT+5:30)
    const istDate = new Date(this.createdAt.getTime() + offset*60000);
    return istDate;
});
const Session = mongoose.model('Session', sessionSchema);

let qrImageBuffer = {};
let whatsappClients = {};
let store;

mongoose.connect('mongodb://127.0.0.1:27017/indexUpdateDB')
    .then(() => {
        store = new MongoStore({ mongoose });
    })
    .catch(err => {
        console.error('Failed to connect to MongoDB:', err);
        process.exit(1);
    });

app.get('/api/start-session/:username', async (req, res) => {
    const username = req.params.username;
    let sessionID = uuidv4();
    const activeSession = await Session.findOne({ username, active: true });
    if (activeSession) {
        sessionID=activeSession.sessionID;
        return res.status(200).json({ message: 'You have an active session', sessionID: activeSession.sessionID });
    }else{
        const session = new Session({ username, sessionID, active: false });
        await session.save();
        whatsappClients[sessionID] = new Client({
            authStrategy: new RemoteAuth({
                clientId : sessionID,
                store,
                backupSyncIntervalMs: 300000,
            }),
        });    
    }
    
   
    whatsappClients[sessionID].on("ready",()=>{
        console.log("client is ready to sent message...");
    })
    
    whatsappClients[sessionID].on('qr', qr => {
        qrImageBuffer[sessionID] = qrImage.imageSync(qr, { type: 'png' });
        console.log(qrImageBuffer[sessionID]);
    });
    
    whatsappClients[sessionID].on('authenticated', async (session) => {
        console.log('Authenticated successfully with session:', sessionID);
        try {
            const dbSession = await Session.findOne({ username, sessionID });
            if (dbSession) {
                dbSession.active = true;
                await dbSession.save();
            }
        } catch (error) {
            console.error('Error updating session active status:', error);
        }
    });

    whatsappClients[sessionID].on('disconnected', async(reason) => {
        console.log('Client'+ whatsappClients[sessionID]+'sessoin id :'+sessionID+' disconnected:', reason);
        if (reason === 'session' || reason === 'qr' || reason === 'auth_failure') {
            console.log('Session expired. You need to reauthenticate.');
            whatsappClients[sessionID].initialize().catch(err => {
                console.error('Failed to initialize WhatsApp client:', err);
            });
        }
    });
    
    whatsappClients[sessionID].initialize().catch(err => {
        console.error('Failed to initialize WhatsApp client:', err);
    });

    res.status(200).json({ message: 'Session started successfully', sessionID });
});

app.get('/api/qr-code/:username/:sessionID', async (req, res) => {
    const username = req.params.username;
    const sessionID = req.params.sessionID;
    const session = await Session.findOne({ username, active: true }); 
    if (session) {
       
        return res.status(200).json({ message: 'You already have an active session', sessionID: session.sessionID });
    }else{
        try {
            if (!qrImageBuffer[sessionID]) {
                return res.status(404).json({ error: 'QR code not available' });
            }
            res.contentType('image/png').end(qrImageBuffer[sessionID], 'binary');
        } catch (error) {
            console.error('Error sending QR code:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
    
});

app.get('/api/send-message/:username/:sessionID', async (req, res) => {
    const username = req.params.username;
    const sessionID = req.params.sessionID;
    const session = await Session.findOne({ username, sessionID });
    if (!session) {
        return res.status(404).json({ error: 'Invalid session ID' });
    }
    try {
        whatsappClients[sessionID].sendMessage('919667700177@c.us', "hello from whatsapp.")
            .then(() => {
                console.log('Message sent successfully');
                res.status(200).json({ message: 'Message sent successfully' });
            })
            .catch(err => {
                console.error('Error sending message:', err);
                res.status(500).json({ error: 'Error sending message' });
            });
    } catch (error) {
        console.error('Error in send-message endpoint:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
