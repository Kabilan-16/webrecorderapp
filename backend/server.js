const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {v4: uuidv4} = require('uuid');

const app=express();
const PORT = 4000;

//Directories
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

//Middleware
app.use(cors({origin: "http://localhost:3000"}));
app.use(express.json());

//serve saved videos for browser preview or playback
app.use('/videos', express.static(UPLOAD_DIR));

//Multer storage
const chunkStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const sessionDir= path.join(UPLOAD_DIR, req.params.sessionId);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir);
        }
        cb(null, sessionDir);
    },
    filename: (req, file, cb) => {
        const chunkIndex = req.params.chunkIndex;
        cb(null,`chunk_${String(chunkIndex).padStart(6,"0")}`);
    }
});

const uploadchunk=multer({storage:chunkStorage});

const sessions={};

//ROUTES
//Start the a new recording sessions, return a unique session ID
app.post("/api/sessions",(req,res)=>{
    try{
        const sessionId=uuidv4();

        sessions[sessionId]={ startedAt: new Date().toISOString(),
            finalized: false,
            filename:null,
        };
        console.log (`[session] started: ${sessionId}`);
        res.status(201).json({sessionId});
    }
    catch(err){
        console.error("Error creating session:",err);
        res.status(500).json({error:"Failed to create session"});
    }
})

//Upload a Single video blob chunk
app.post("/api/sessions/:sessionId/chunks/:chunkIndex", uploadchunk.single('chunk'),(req,res)=>{
    try{
        const {sessionId, chunkIndex} = req.params;
        if (!sessions[sessionId]) {
            return res.status(404).json({error:"Session not found"});
        }
        if (sessions[sessionId].finalized) {
            return res.status(400).json({error:"Session already finalized"});
        }
        if(!req.file){
            return res.status(400).json({error:"No chunk file uploaded"});
        }
        console.log(`[chunk] session: ${sessionId}, chunk: ${chunkIndex}, size: ${req.file.size}B`);
        res.status(200).json({received:true, chunkIndex: Number(chunkIndex)});
    }
    catch(err){
        console.error("Error uploading chunk:",err);
        res.status(500).json({error:"Failed to upload chunk"});
    }
});

//All Received chunks into a single video file
app.post("/api/sessions/:sessionId/finalize",(req,res)=>{
    try{
        const {sessionId} = req.params;
        if (!sessions[sessionId]) {
            return res.status(404).json({error:"Session not found"});
        }
        if (sessions[sessionId].finalized) {
            return res.status(400).json({error:"Session already finalized"});
        }
        const sessionDir = path.join(UPLOAD_DIR, sessionId);
        if (!fs.existsSync(sessionDir)) {
            return res.status(400).json({error:"No chunks uploaded for this session"});
        }
        const chunkFiles = fs.readdirSync(sessionDir)
            .filter(file => file.startsWith('chunk_'))
            .sort();

        if (chunkFiles.length === 0) {
            return res.status(400).json({error:"No chunks uploaded for this session"});
        }
        const outputFilename = `recording_${sessionId}.webm`;
        const outputPath = path.join(UPLOAD_DIR, outputFilename);
        const writeStream = fs.createWriteStream(outputPath);
        for(const chunkFile of chunkFiles){
            const chunkPath = path.join(sessionDir, chunkFile);
            const data = fs.readFileSync(chunkPath);
            writeStream.write(data);
        }
        writeStream.end();
        writeStream.on('finish',()=>{
            try{
                fs.rmSync(sessionDir, {recursive:true, force:true});
                const stats = fs.statSync(outputPath);
                sessions[sessionId].finalized=true;
                sessions[sessionId].filename=outputFilename;
                console.log(`[finalize] ${outputFilename} (${(stats.size/1024).toFixed(1)} KB)`);
                return res.status(200).json({
                    previewUrl:`/videos/${outputFilename}`,
                    downloadUrl:`/api/videos/${encodeURIComponent(outputFilename)}/download`,
                    filename: outputFilename,
                    size: stats.size,
                });
            }
            catch(err){
                console.error("Error finalizing session:",err);
                return res.status(500).json({error:"Failed to finalize session"});
            }
        });
        writeStream.on('error',(err)=>{
            console.error("Error writing final video file:",err);
            return res.status(500).json({error:"Failed to finalize session"});
        });
    }catch(err){
        console.error("unexpected error:",err);
        return res.status(500).json({error:"unexpected error finalizing session"});
    }
});

//Download the finalized video file
app.get("/api/videos/:filename/download",(req,res)=>{
    try{
        const filename=path.basename(req.params.filename);
        const filePath=path.join(UPLOAD_DIR, filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({error:"Video file not found"});
        }
        return res.download(filePath, filename, (err)=>{
            if(err){
                console.error("Error sending file for download:",err);
                if (!res.headersSent) {
                    return res.status(500).json({error:"Failed to download file"});
                }
            }
        });
    }catch(err){
        console.error("Error handling download request:",err);
        if (!res.headersSent) {
            return res.status(500).json({error:"Failed to download file"});
        }
    }
});

//Check current session status
app.get("/api/sessions/:sessionId/status",(req,res)=>{
    try{
        const session = sessions[req.params.sessionId];
        if (!session) {
            return res.status(404).json({error:"Session not found"});
        }
        return res.json(session);
    }catch(err){
        console.error("Error checking session status:",err);
        return res.status(500).json({error:"Failed to check session status"});
    }
});

//List all the finalized videos
app.get("/api/videos",(req,res)=>{
    try{
        const files = fs.readdirSync(UPLOAD_DIR)
            .filter((f)=>f.endsWith('.webm'))
            .map((f)=>{
                const stats = fs.statSync(path.join(UPLOAD_DIR, f));
                return {
                    filename: f,
                    previewUrl: `/videos/${f}`,
                    downloadUrl: `/api/videos/${encodeURIComponent(f)}/download`,
                    sizeBytes: stats.size,
                    createdAt: stats.birthtime.toISOString(),
                };
            })
            .sort((a,b)=>new Date(b.createdAt) - new Date(a.createdAt));
        return res.json({videos:files});
    }catch(err){
        console.error("Error listing videos:",err);
        return res.status(500).json({error:"Failed to list videos"});
    }
});


app.listen(PORT,()=>{
    console.log (`backend server running on https://localhost:${PORT}`);
    console.log(`Upload directory: ${UPLOAD_DIR}`);
})