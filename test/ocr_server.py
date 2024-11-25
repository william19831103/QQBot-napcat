from flask import Flask, request, jsonify
import requests
import tempfile
import os
import hashlib
from typing import Dict, Any
from abc import ABC, abstractmethod
import base64

app = Flask(__name__)

class OCRProvider(ABC):
    @abstractmethod
    def recognize(self, image_data: bytes) -> Dict[str, Any]:
        pass

    @abstractmethod
    def check_availability(self) -> bool:
        pass

class OCRSpaceProvider(OCRProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.url = "https://api.ocr.space/parse/image"

    def recognize(self, image_data: bytes) -> Dict[str, Any]:
        headers = {
            'apikey': self.api_key,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        payload = {
            'language': 'chs',
            'isOverlayRequired': False,
            'detectOrientation': False,
            'OCREngine': 2,
            'scale': True,
            'filetype': 'PNG',
            'base64Image': f"data:image/png;base64,{base64.b64encode(image_data).decode()}"
        }
        
        try:
            response = requests.post(
                self.url, 
                headers=headers, 
                data=payload,
                timeout=15
            )
            result = response.json()
            
            if result.get("OCRExitCode") == 1 and result.get("ParsedResults"):
                return {
                    "success": True,
                    "text": result["ParsedResults"][0]["ParsedText"]
                }
            return {"success": False, "error": str(result.get("ErrorMessage", "Unknown error"))}
            
        except requests.exceptions.Timeout:
            return {"success": False, "error": "OCR.space 服务超时"}
        except Exception as e:
            return {"success": False, "error": f"OCR.space 服务错误: {str(e)}"}

    def check_availability(self) -> bool:
        try:
            test_image = b"..."  # 1x1像素的PNG图片数据
            result = self.recognize(test_image)
            return result.get("success", False)
        except:
            return False

class BaiduOCRProvider(OCRProvider):
    def __init__(self, app_id: str, api_key: str, secret_key: str):
        self.app_id = app_id
        self.api_key = api_key
        self.secret_key = secret_key
        self.access_token = None
        self.url = "https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic"
        self._get_access_token()

    def _get_access_token(self):
        try:
            url = "https://aip.baidubce.com/oauth/2.0/token"
            params = {
                "grant_type": "client_credentials",
                "client_id": self.api_key,
                "client_secret": self.secret_key
            }
            response = requests.post(url, params=params, timeout=10)
            self.access_token = response.json().get("access_token")
        except Exception as e:
            print(f"获取百度access_token失败: {e}")

    def recognize(self, image_data: bytes) -> Dict[str, Any]:
        if not self.access_token:
            self._get_access_token()
            if not self.access_token:
                return {"success": False, "error": "无法获取百度OCR访问令牌"}

        try:
            params = {"access_token": self.access_token}
            headers = {'Content-Type': 'application/x-www-form-urlencoded'}
            
            image_base64 = base64.b64encode(image_data).decode()
            data = {"image": image_base64}
            
            response = requests.post(
                self.url, 
                params=params, 
                headers=headers, 
                data=data,
                timeout=15
            )
            result = response.json()
            
            if "error_code" in result:
                return {"success": False, "error": f"百度OCR错误: {result.get('error_msg')}"}
            
            if "words_result" in result:
                text = "\n".join([item["words"] for item in result["words_result"]])
                return {"success": True, "text": text}
                
            return {"success": False, "error": "百度OCR返回数据格式错误"}
            
        except requests.exceptions.Timeout:
            return {"success": False, "error": "百度OCR服务超时"}
        except Exception as e:
            return {"success": False, "error": f"百度OCR服务错误: {str(e)}"}

    def check_availability(self) -> bool:
        try:
            self.access_token = self.get_access_token()
            return bool(self.access_token)
        except:
            return False

class YDOCRProvider(OCRProvider):
    def __init__(self, user_id: str, user_key: str):
        self.user_id = user_id
        self.user_key = user_key
        self.url = "http://cn-hangzhou.api.ydocr.com/ocr"

    def md5(self, data: bytes) -> str:
        return hashlib.md5(data).hexdigest()

    def md5_str(self, text: str) -> str:
        return hashlib.md5(text.encode('utf-8')).hexdigest()

    def recognize(self, image_data: bytes) -> Dict[str, Any]:
        body_md5 = self.md5(image_data)
        signature = self.md5_str(self.md5_str(body_md5 + self.user_id + self.user_key))
        
        params = {
            "userID": self.user_id,
            "signature": signature,
            "signatureMethod": "md5",
            "bodyMD5": body_md5,
            "version": "v2",
            "action": "page",
            "language": "ch",
            "rotate": 0
        }
        
        response = requests.post(self.url, data=image_data, params=params)
        result = response.json()
        
        if result.get("code") == 0:
            return {"success": True, "text": result.get("data", {}).get("text", "")}
        return {"success": False, "error": result.get("message", "Unknown error")}

    def check_availability(self) -> bool:
        try:
            balance_url = "http://cn-hangzhou.ydocr.com/getBalance"
            data = {
                "userID": self.user_id,
                "signature": self.user_key,
                "signatureMethod": "secretKey",
            }
            response = requests.post(balance_url, json=data)
            result = response.json()
            return result.get("code") == 0
        except:
            return False

class OCRManager:
    def __init__(self):
        self.ocr_space_keys = ['K87108387888957', 'K89499185488957', 'K82081561288957']
        self.current_ocr_space_index = 0
        self.baidu_provider = BaiduOCRProvider(
            "116369516",
            "MqDczhgq3uYFgLZ4G2sF7UPT",
            "b2DZEG2EQsF003S9O3WLaVrncB75jFHy"
        )
        self.yd_provider = YDOCRProvider(
            "ghjcy6bnuaxdusidcwwv2qfd",
            "g7dubchas4cplaix5lusulxs"
        )

    def recognize(self, image_data: bytes) -> Dict[str, Any]:
        errors = []
        
        for key in self.ocr_space_keys:
            try:
                print(f"尝试使用OCR.space (key: {key})...")
                provider = OCRSpaceProvider(key)
                result = provider.recognize(image_data)
                if result["success"]:
                    print("OCR.space识别成功")
                    return result
                errors.append(f"OCR.space: {result.get('error')}")
            except Exception as e:
                errors.append(f"OCR.space异常: {str(e)}")

        try:
            print("尝试使用百度OCR...")
            result = self.baidu_provider.recognize(image_data)
            if result["success"]:
                print("百度OCR识别成功")
                return result
            errors.append(f"百度OCR: {result.get('error')}")
        except Exception as e:
            errors.append(f"百度OCR异常: {str(e)}")

        try:
            print("尝试使用YDOCR...")
            result = self.yd_provider.recognize(image_data)
            if result["success"]:
                print("YDOCR识别成功")
                return result
            errors.append(f"YDOCR: {result.get('error')}")
        except Exception as e:
            errors.append(f"YDOCR异常: {str(e)}")

        error_message = " | ".join(errors)
        print(f"所有OCR服务都失败了: {error_message}")
        return {"success": False, "error": error_message}

# 初始化 OCR 管理器
ocr_manager = OCRManager()

@app.route('/ocr', methods=['POST'])
def ocr():
    if 'image' not in request.files:
        print("错误: 没有收到图片文件")
        return jsonify({
            'success': False,
            'error': '没有收到图片文件'
        }), 400

    try:
        image_file = request.files['image']
        image_data = image_file.read()
        
        if not image_data:
            print("错误: 图片数据为空")
            return jsonify({
                'success': False,
                'error': '图片数据为空'
            }), 400
            
        print(f"收到图片数据: {len(image_data)} 字节")
        
        # 直接使用图片数据进行OCR识别
        result = ocr_manager.recognize(image_data)
        print(f"OCR识别结果: {result}")
        return jsonify(result)
        
    except Exception as e:
        print(f"OCR处理异常: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=True) 