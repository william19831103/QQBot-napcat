import * as fs from 'fs'
import * as path from 'path'

export class KeywordDetector {
  private keywords: string[]

  constructor(keywords: string[]) {
    this.keywords = keywords
  }

  public loadKeywords(): void {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'))
      this.keywords = config.adwords
      console.log('关键词重载成功:', this.keywords)
    } catch (error) {
      console.error('加载关键词失败:', error)
    }
  }

  // 检测连续数字
  private detectContinuousNumbers(text: string): boolean {
    // 匹配6-10位连续数字
    const numberPattern = /\d{8,10}/g
    const matches = text.match(numberPattern)
    if (matches) {
      console.log('检测到连续数字:', matches)
      return true
    }
    return false
  }

  public detect(text: string): boolean {
    // 先检查关键词
    const hasKeyword = this.keywords.some(keyword => text.includes(keyword))
    if (hasKeyword) {
      return true
    }
    
    // 再检查连续数字
    return this.detectContinuousNumbers(text)
  }

  public getMatchedKeywords(text: string): string[] {
    const matchedKeywords = this.keywords.filter(keyword => text.includes(keyword))
    
    // 检查连续数字
    const numberPattern = /\d{6,10}/g
    const matches = text.match(numberPattern) || []
    
    // 如果找到连续数字，添加到匹配结果中
    if (matches.length > 0) {
      matchedKeywords.push(...matches.map(num => `连续数字(${num})`))
    }
    
    return matchedKeywords
  }

  public getCurrentKeywords(): string[] {
    return this.keywords
  }
} 