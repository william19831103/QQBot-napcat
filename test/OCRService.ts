import crypto from 'crypto'
import fetch from 'node-fetch'
import FormData from 'form-data'

// OCR响应接口
interface OCRResponse {
  success: boolean
  text?: string
  error?: string
}

// OCR提供者抽象接口
interface OCRProvider {
  recognize(imageData: Buffer): Promise<OCRResponse>
  checkAvailability(): Promise<boolean>
}

// OCR.space提供者
class OCRSpaceProvider implements OCRProvider {
  private apiKey: string
  private url = 'https://api.ocr.space/parse/image'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async recognize(imageData: Buffer): Promise<OCRResponse> {
    const headers = {
      'apikey': this.apiKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    }

    const payload = {
      'language': 'chs',
      'isOverlayRequired': false,
      'detectOrientation': false,
      'OCREngine': 2,
      'scale': true,
      'filetype': 'PNG',
      'base64Image': `data:image/png;base64,${imageData.toString('base64')}`
    }

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers,
        body: new URLSearchParams(payload as any),
        timeout: 15000
      })

      const result = await response.json()

      if (result.OCRExitCode === 1 && result.ParsedResults) {
        return {
          success: true,
          text: result.ParsedResults[0].ParsedText
        }
      }
      return { success: false, error: result.ErrorMessage || 'Unknown error' }
    } catch (error) {
      if (error.type === 'request-timeout') {
        return { success: false, error: 'OCR.space 服务超时' }
      }
      return { success: false, error: `OCR.space 服务错误: ${error.message}` }
    }
  }

  async checkAvailability(): Promise<boolean> {
    try {
      const testImage = Buffer.from('') // 1x1像素的PNG图片数据
      const result = await this.recognize(testImage)
      return result.success
    } catch {
      return false
    }
  }
}

// 百度OCR提供者
class BaiduOCRProvider implements OCRProvider {
  private appId: string
  private apiKey: string
  private secretKey: string
  private accessToken: string | null = null
  private url = 'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic'

  constructor(appId: string, apiKey: string, secretKey: string) {
    this.appId = appId
    this.apiKey = apiKey
    this.secretKey = secretKey
    this.getAccessToken()
  }

  private async getAccessToken(): Promise<void> {
    try {
      const url = 'https://aip.baidubce.com/oauth/2.0/token'
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.apiKey,
        client_secret: this.secretKey
      })

      const response = await fetch(`${url}?${params}`, {
        method: 'POST',
        timeout: 10000
      })

      const result = await response.json()
      this.accessToken = result.access_token
    } catch (error) {
      console.error('获取百度access_token失败:', error)
    }
  }

  async recognize(imageData: Buffer): Promise<OCRResponse> {
    if (!this.accessToken) {
      await this.getAccessToken()
      if (!this.accessToken) {
        return { success: false, error: '无法获取百度OCR访问令牌' }
      }
    }

    try {
      const params = new URLSearchParams({ access_token: this.accessToken })
      const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
      const data = new URLSearchParams({
        image: imageData.toString('base64')
      })

      const response = await fetch(`${this.url}?${params}`, {
        method: 'POST',
        headers,
        body: data,
        timeout: 15000
      })

      const result = await response.json()

      if ('error_code' in result) {
        return { success: false, error: `百度OCR错误: ${result.error_msg}` }
      }

      if ('words_result' in result) {
        const text = result.words_result.map((item: any) => item.words).join('\n')
        return { success: true, text }
      }

      return { success: false, error: '百度OCR返回数据格式错误' }
    } catch (error) {
      if (error.type === 'request-timeout') {
        return { success: false, error: '百度OCR服务超时' }
      }
      return { success: false, error: `百度OCR服务错误: ${error.message}` }
    }
  }

  async checkAvailability(): Promise<boolean> {
    try {
      await this.getAccessToken()
      return !!this.accessToken
    } catch {
      return false
    }
  }
}

// 有道OCR提供者
class YDOCRProvider implements OCRProvider {
  private userId: string
  private userKey: string
  private url = 'http://cn-hangzhou.api.ydocr.com/ocr'

  constructor(userId: string, userKey: string) {
    this.userId = userId
    this.userKey = userKey
  }

  private md5(data: Buffer): string {
    return crypto.createHash('md5').update(data).digest('hex')
  }

  private md5Str(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex')
  }

  async recognize(imageData: Buffer): Promise<OCRResponse> {
    const bodyMd5 = this.md5(imageData)
    const signature = this.md5Str(this.md5Str(bodyMd5 + this.userId + this.userKey))

    const params = new URLSearchParams({
      userID: this.userId,
      signature,
      signatureMethod: 'md5',
      bodyMD5: bodyMd5,
      version: 'v2',
      action: 'page',
      language: 'ch',
      rotate: '0'
    })

    try {
      const response = await fetch(`${this.url}?${params}`, {
        method: 'POST',
        body: imageData,
        timeout: 15000
      })

      const result = await response.json()

      if (result.code === 0) {
        return { success: true, text: result.data?.text || '' }
      }
      return { success: false, error: result.message || 'Unknown error' }
    } catch (error) {
      return { success: false, error: `YDOCR服务错误: ${error.message}` }
    }
  }

  async checkAvailability(): Promise<boolean> {
    try {
      const balanceUrl = 'http://cn-hangzhou.ydocr.com/getBalance'
      const data = {
        userID: this.userId,
        signature: this.userKey,
        signatureMethod: 'secretKey'
      }

      const response = await fetch(balanceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      const result = await response.json()
      return result.code === 0
    } catch {
      return false
    }
  }
}

// OCR管理器
export class OCRManager {
  private ocrSpaceKeys = ['K87108387888957', 'K89499185488957', 'K82081561288957']
  private currentOcrSpaceIndex = 0
  private baiduProvider: BaiduOCRProvider
  private ydProvider: YDOCRProvider

  constructor() {
    this.baiduProvider = new BaiduOCRProvider(
      '116369516',
      'MqDczhgq3uYFgLZ4G2sF7UPT',
      'b2DZEG2EQsF003S9O3WLaVrncB75jFHy'
    )
    this.ydProvider = new YDOCRProvider(
      'ghjcy6bnuaxdusidcwwv2qfd',
      'g7dubchas4cplaix5lusulxs'
    )
  }

  async recognize(imageData: Buffer): Promise<OCRResponse> {
    const errors: string[] = []

    // 尝试OCR.space
    for (const key of this.ocrSpaceKeys) {
      try {
        console.log(`尝试使用OCR.space (key: ${key})...`)
        const provider = new OCRSpaceProvider(key)
        const result = await provider.recognize(imageData)
        if (result.success) {
          console.log('OCR.space识别成功')
          return result
        }
        errors.push(`OCR.space: ${result.error}`)
      } catch (error) {
        errors.push(`OCR.space异常: ${error.message}`)
      }
    }

    // 尝试百度OCR
    try {
      console.log('尝试使用百度OCR...')
      const result = await this.baiduProvider.recognize(imageData)
      if (result.success) {
        console.log('百度OCR识别成功')
        return result
      }
      errors.push(`百度OCR: ${result.error}`)
    } catch (error) {
      errors.push(`百度OCR异常: ${error.message}`)
    }

    // 尝试YDOCR
    try {
      console.log('尝试使用YDOCR...')
      const result = await this.ydProvider.recognize(imageData)
      if (result.success) {
        console.log('YDOCR识别成功')
        return result
      }
      errors.push(`YDOCR: ${result.error}`)
    } catch (error) {
      errors.push(`YDOCR异常: ${error.message}`)
    }

    const errorMessage = errors.join(' | ')
    console.log(`所有OCR服务都失败了: ${errorMessage}`)
    return { success: false, error: errorMessage }
  }
} 