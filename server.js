// ============================================
// 🚀 RESUME OPTIMIZER BACKEND SERVER
// ============================================

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import mongoose from 'mongoose';
import connectDB from './db.js';
import Submission from './resumeModel.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini';

// ==========================================
// 🔐 AI CLIENT INITIALIZATION
// ==========================================

let aiClient;
let geminiModel;

if (AI_PROVIDER === 'openai') {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ ERROR: OPENAI_API_KEY not found in .env file');
    process.exit(1);
  }
  
  aiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  
  console.log('✅ OpenAI client initialized');
}

if (AI_PROVIDER === 'openrouter') {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('❌ ERROR: OPENROUTER_API_KEY not found');
    process.exit(1);
  }
  aiClient = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
      'X-Title': 'ATS Resume Optimizer'
    }
  });
  console.log('✅ OpenRouter client initialized');
}

if (AI_PROVIDER === 'gemini') {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ ERROR: GEMINI_API_KEY not found in .env file');
    process.exit(1);
  }
  
  aiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  geminiModel = aiClient.getGenerativeModel({ 
    model: 'gemini-2.0-flash-exp'
  });
  
  console.log('✅ Gemini client initialized');
}

// Connect Database
connectDB();

// ==========================================
// 🛡️ MIDDLEWARE
// ==========================================

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 📊 CALL AI FUNCTION
// ==========================================

async function callAI(systemPrompt, userPrompt) {
  try {
    if (AI_PROVIDER === 'openai' || AI_PROVIDER === 'openrouter') {
      const modelName = (AI_PROVIDER === 'openrouter')
        ? 'google/gemini-flash-1.5'
        : 'gpt-4o';

      console.log(`🤖 Calling ${modelName}`);
      
      const response = await aiClient.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });
      return response.choices[0].message.content;
    }
    
    if (AI_PROVIDER === 'gemini') {
      console.log('🤖 Calling Google Gemini...');
      
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
      const result = await geminiModel.generateContent(fullPrompt);
      const response = result.response;
      
      return response.text();
    }
    
    throw new Error('Invalid AI provider specified');
    
  } catch (error) {
    console.error('❌ AI API Error:', error.message);
    
    if (error.message && error.message.includes('API key')) {
      throw new Error('Invalid API key. Please check your .env file.');
    }
    
    throw error;
  }
}

// ==========================================
// 📝 ROUTE: ANALYZE RESUME
// ==========================================

app.post('/analyze-resume', async (req, res) => {
  try {
    console.log('📨 Received resume analysis request');
    
    const { resumeText, prompt, fileName, fileType, fileSize } = req.body;
    
    if (!resumeText || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing resumeText or prompt in request body',
      });
    }
    
    if (resumeText.trim().length < 50) {
      return res.status(400).json({
        success: false,
        error: 'Resume text is too short (minimum 50 characters)',
      });
    }
    
    console.log(`📄 Resume length: ${resumeText.length} characters`);
    
    const systemPrompt = 'You are an expert resume reviewer and ATS specialist. Always respond with valid JSON only, no additional text.';
    const userPrompt = prompt.replace('{{DOCUMENT_TEXT}}', resumeText);
    
    const aiResponse = await callAI(systemPrompt, userPrompt);
    
    console.log('✅ AI response received');
    
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('No valid JSON found in AI response');
    }
    
    const analysisData = JSON.parse(jsonMatch[0]);
    
    if (!analysisData.overallScore && !analysisData.error) {
      throw new Error('Invalid analysis format from AI');
    }
    
    if (analysisData.error) {
      return res.status(400).json({
        success: false,
        error: analysisData.error,
      });
    }

    // 💾 Save to database
    try {
      const submission = new Submission({
        fileName: fileName || 'unknown.pdf',
        fileType: fileType || 'pdf',
        fileSize: fileSize || 0,
        analysisType: 'analyzer',
        resumeText: resumeText,
        resumeTextLength: resumeText.length,
        analyzerResults: analysisData,
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('user-agent') || 'unknown'
      });
      
      await submission.save();
      console.log('✅ Saved to database:', submission._id);
    } catch (dbError) {
      console.error('⚠️ Database save error:', dbError.message);
      // Continue even if DB save fails
    }
    
    return res.json({
      success: true,
      data: analysisData,
    });
    
  } catch (error) {
    console.error('❌ Analysis error:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze resume. Please try again.',
    });
  }
});

// ==========================================
// 🎯 ROUTE: MATCH RESUME WITH JOB
// ==========================================

app.post('/match-job', async (req, res) => {
  try {
    console.log('📨 Received job matching request');
    
    const { resumeText, jobDescription, prompt, fileName, fileType, fileSize } = req.body;
    
    if (!resumeText || !jobDescription || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: resumeText, jobDescription, or prompt',
      });
    }
    
    if (resumeText.trim().length < 50) {
      return res.status(400).json({
        success: false,
        error: 'Resume text is too short',
      });
    }
    
    if (jobDescription.trim().length < 50) {
      return res.status(400).json({
        success: false,
        error: 'Job description is too short',
      });
    }
    
    console.log(`📄 Resume: ${resumeText.length} chars, Job: ${jobDescription.length} chars`);
    
    const systemPrompt = 'You are an expert recruiter and ATS system analyzer. Always respond with valid JSON only, no additional text.';
    const userPrompt = prompt
      .replace('{{RESUME_TEXT}}', resumeText)
      .replace('{{JOB_DESCRIPTION}}', jobDescription);
    
    const aiResponse = await callAI(systemPrompt, userPrompt);
    
    console.log('✅ AI response received');
    
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('No valid JSON found in AI response');
    }
    
    const matchData = JSON.parse(jsonMatch[0]);
    
    if (!matchData.matchPercentage) {
      throw new Error('Invalid match format from AI');
    }

    // 💾 Save to database
    try {
      const submission = new Submission({
        fileName: fileName || 'unknown.pdf',
        fileType: fileType || 'pdf',
        fileSize: fileSize || 0,
        analysisType: 'matcher',
        resumeText: resumeText,
        resumeTextLength: resumeText.length,
        jobDescription: jobDescription,
        matcherResults: matchData,
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('user-agent') || 'unknown'
      });
      
      await submission.save();
      console.log('✅ Saved to database:', submission._id);
    } catch (dbError) {
      console.error('⚠️ Database save error:', dbError.message);
      // Continue even if DB save fails
    }
    
    return res.json({
      success: true,
      data: matchData,
    });
    
  } catch (error) {
    console.error('❌ Match error:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to match resume with job. Please try again.',
    });
  }
});

// ==========================================
// 📊 DASHBOARD API ROUTES
// ==========================================

// Get all submissions
app.get('/api/submissions', async (req, res) => {
  try {
    console.log('📨 Fetching submissions...');
    
    const { limit = 50, type } = req.query;
    
    let query = {};
    if (type && ['analyzer', 'matcher'].includes(type)) {
      query.analysisType = type;
    }
    
    const submissions = await Submission
      .find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    console.log(`✅ Found ${submissions.length} submissions`);
    
    return res.json({
      success: true,
      data: submissions
    });
    
  } catch (error) {
    console.error('❌ Error fetching submissions:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get statistics
app.get('/api/statistics', async (req, res) => {
  try {
    console.log('📨 Fetching statistics...');
    
    const totalSubmissions = await Submission.countDocuments();
    const totalAnalyzer = await Submission.countDocuments({ analysisType: 'analyzer' });
    const totalMatcher = await Submission.countDocuments({ analysisType: 'matcher' });
    
    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentActivity = await Submission.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });
    
    const stats = {
      totalSubmissions,
      totalAnalyzer,
      totalMatcher,
      recentActivity
    };
    
    console.log('✅ Statistics:', stats);
    
    return res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single submission by ID
app.get('/api/submissions/:id', async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    
    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }
    
    return res.json({
      success: true,
      data: submission
    });
    
  } catch (error) {
    console.error('❌ Error fetching submission:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete submission
app.delete('/api/submissions/:id', async (req, res) => {
  try {
    const result = await Submission.findByIdAndDelete(req.params.id);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }
    
    return res.json({
      success: true,
      message: 'Submission deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting submission:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// ❤️ ROUTE: HEALTH CHECK
// ==========================================

app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
  res.json({
    status: 'ok',
    provider: AI_PROVIDER,
    database: dbStatus,
    message: 'Resume Optimizer API is running',
  });
});

// ==========================================
// 🚀 START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log('🚀=================================🚀');
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`🤖 Using AI Provider: ${AI_PROVIDER.toUpperCase()}`);
  console.log(`🌐 Frontend allowed from: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log('🚀=================================🚀');
});