// ============================================
// 🚀 RESUME OPTIMIZER BACKEND SERVER (FIXED)
// ============================================

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';  // ✅ FIXED

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';

// ==========================================
// 🔐 AI CLIENT INITIALIZATION (FIXED)
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

// OPENROUTER (new)
if (AI_PROVIDER === 'openrouter') {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('❌ ERROR: OPENROUTER_API_KEY not found');
    process.exit(1);
  }
  aiClient = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    // optional headers recommended by OpenRouter:
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
  
  // ✅ FIXED: Correct initialization
  aiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  geminiModel = aiClient.getGenerativeModel({ 
    model: 'gemini-2.5-flash'  // ✅ Updated model
  });
  
  console.log('✅ Gemini client initialized');
}

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
// 📊 CALL AI FUNCTION (FIXED)
// ==========================================

async function callAI(systemPrompt, userPrompt) {
  try {
    // ===== OpenAI Implementation =====
    if (AI_PROVIDER === 'openai' || AI_PROVIDER === 'openrouter') {
      
       const modelName = (AI_PROVIDER === 'openrouter')
        ? 'google/gemini-1.5-flash'  // or any model you’ve enabled in OpenRouter
        : 'gpt-4o';

      console.log(`🤖 Calling ${modelName}` );
      
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



    
    // ===== Gemini Implementation (FIXED) =====
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

app.post('/api/analyze-resume', async (req, res) => {
  try {
    console.log('📨 Received resume analysis request');
    
    const { resumeText, prompt } = req.body;
    
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
    
    // Parse JSON from response
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

app.post('/api/match-job', async (req, res) => {
  try {
    console.log('📨 Received job matching request');
    
    const { resumeText, jobDescription, prompt } = req.body;
    
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
// ❤️ ROUTE: HEALTH CHECK
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: AI_PROVIDER,
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
