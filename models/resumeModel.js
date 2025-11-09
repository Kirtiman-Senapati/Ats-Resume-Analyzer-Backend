import mongoose from "mongoose";


const userSchema = new mongoose.Schema(
{
    fileName: String,
  fileType: 'pdf' | 'docx',
  fileSize: Number,
  analysisType: 'analyzer' | 'matcher',
  resumeText: String,
  resumeTextLength: Number,
  jobDescription: String (optional),
  analyzerResults: {
    overallScore: Number,
    strengths: [String],
    improvements: [String],
    
},


matcherResults:
{
    matchPercentage: Number,
    matchLevel: String,
    // ... more fields
  },
  ipAddress: String,
  userAgent: String,
  createdAt: Date,
  updatedAt: Date
},

)

export default mongoose.model("user",userSchema);