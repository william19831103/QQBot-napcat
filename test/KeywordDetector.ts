import * as fs from 'fs'
import * as path from 'path'

// 配置接口
interface Config {
  ad_keywords: string[]
  ad_words: string[]
  matchCount: number
}

// 检测结果接口
interface DetectionResult {
  detected: boolean
  type: 'keyword' | 'length' | 'number' | 'none'
  value?: string | string[]
}

export class KeywordDetector {
  private keywords: string[]
  private readonly MAX_TEXT_LENGTH = 200
  private configPath: string
  private config: Config | null = null

  constructor(configPath: string) {
    this.keywords = []
    this.configPath = configPath
    this.loadKeywords()
  }

  public loadKeywords(): void {
    try {
      this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
      // 合并 ad_keywords 和 ad_words，添加空值检查
      const adKeywords = this.config?.ad_keywords || []
      const adWords = this.config?.ad_words || []
      this.keywords = [...adKeywords, ...adWords]
      
      console.log('配置重载成功:', {
        keywords: this.keywords,
        matchCount: this.config?.matchCount || 3
      })
    } catch (error) {
      console.error('加载配置失败:', error)
      this.keywords = []
      this.config = null
    }
  }

  // 获取匹配所需数量
  public getMatchCount(): number {
    return this.config?.matchCount || 3 // 默认值为3
  }

  // 获取当前完整配置
  public getCurrentConfig(): Config | null {
    return this.config
  }

  // 检测关键词
  private detectKeywords(text: string): DetectionResult {
    if (!Array.isArray(this.keywords)) {
      console.error('关键词列表无效:', this.keywords)
      return { detected: false, type: 'none' }
    }

    const matches = this.keywords.filter(keyword => text.includes(keyword))
    if (matches.length > 0) {
      console.log('检测到关键词:', matches)
      return {
        detected: true,
        type: 'keyword',
        value: matches
      }
    }
    return { detected: false, type: 'none' }
  }

  // 检测中文文本长度
  private detectTextLength(text: string): DetectionResult {
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || []
    const chineseLength = chineseChars.length
    
    if (chineseLength > this.MAX_TEXT_LENGTH) {
      console.log(`检测到超长文本: ${chineseLength} 个中文字符`)
      return {
        detected: true,
        type: 'length',
        value: `${chineseLength}`
      }
    }
    return { detected: false, type: 'none' }
  }

  // 检测连续数字
  private detectContinuousNumbers(text: string): DetectionResult {
    const numberPattern = /\d{8,10}/g
    const matches = text.match(numberPattern)
    if (matches) {
      console.log('检测到连续数字:', matches)
      return {
        detected: true,
        type: 'number',
        value: matches
      }
    }
    return { detected: false, type: 'none' }
  }

  public detect(text: string): boolean {
    // 按优先级顺序检测
    const result = this.getMatchedKeywords(text)
    return result.length > 0
  }

  public getMatchedKeywords(text: string): string[] {
    // 1. 首先检查关键词
    const keywordResult = this.detectKeywords(text)
    if (keywordResult.detected) {
      return keywordResult.value as string[]
    }

    // 2. 其次检查文本长度
    const lengthResult = this.detectTextLength(text)
    if (lengthResult.detected) {
      return [`超长文本(${lengthResult.value}字)`]
    }

    // 3. 最后检查连续数字
    const numberResult = this.detectContinuousNumbers(text)
    if (numberResult.detected) {
      return (numberResult.value as string[]).map(num => `连续数字(${num})`)
    }

    return []
  }

  public getCurrentKeywords(): string[] {
    return this.keywords
  }
} 