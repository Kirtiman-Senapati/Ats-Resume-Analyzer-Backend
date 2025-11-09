import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: true
    },
    fileType: {
      type: String,
      enum: ['pdf', 'docx'],
      required: true
    },
    fileSize: {
      type: Number,
      required: true
    },
    analysisType: {
      type: String,
      enum: ['analyzer', 'matcher'],
      required: true
    },
    resumeText: {
      type: String,
      required: true
    },
    resumeTextLength: {
      type: Number,
      required: true
    },
    jobDescription: {
      type: String,
      default: null
    },
    analyzerResults: {
      overallScore: Number,
      strengths: [String],
      improvements: [String],
      summary: String,
      performanceMetrics: mongoose.Schema.Types.Mixed,
      actionItems: [String],
      proTips: [String],
      keywords: [String]
    },
    matcherResults: {
      matchPercentage: Number,
      matchLevel: String,
      executiveSummary: String,
      overallAssessment: String,
      matchingSkills: [String],
      missingSkills: [String],
      strengthsForThisJob: [String],
      weaknessesForThisJob: [String],
      recommendations: [String],
      detailedBreakdown: mongoose.Schema.Types.Mixed
    },
    ipAddress: {
      type: String,
      default: 'unknown'
    },
    userAgent: {
      type: String,
      default: 'unknown'
    }
  },
  {
    timestamps: true // Automatically adds createdAt and updatedAt
  }
);

export default mongoose.model("Submission", submissionSchema);