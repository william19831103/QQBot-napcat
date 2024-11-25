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

  public detect(text: string): boolean {
    return this.keywords.some(keyword => text.includes(keyword))
  }

  public getMatchedKeywords(text: string): string[] {
    return this.keywords.filter(keyword => text.includes(keyword))
  }

  public getCurrentKeywords(): string[] {
    return this.keywords
  }
} 