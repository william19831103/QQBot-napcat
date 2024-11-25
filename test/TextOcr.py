import requests
from io import BytesIO
from typing import Dict, Any, Optional
from abc import ABC, abstractmethod

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
        headers = {'apikey': self.api_key}
        payload = {
            'language': 'chs',
            'isOverlayRequired': True,
            'detectOrientation': True,
            'OCREngine': 2,
            'scale': True,
            'detectCheckbox': False,
        }
        files = {'file': ('image.png', image_data)}
        
        response = requests.post(self.url, headers=headers, files=files, data=payload, timeout=30)
        result = response.json()
        
        if result.get("OCRExitCode") == 1:
            return {
                "success": True,
                "text": result["ParsedResults"][0]["ParsedText"]
            }
        return {"success": False, "error": str(result.get("ErrorMessage", "Unknown error"))}

    def check_availability(self) -> bool:
        try:
            # 使用一个小的测试图片
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

    def get_access_token(self):
        url = f"https://aip.baidubce.com/oauth/2.0/token"
        params = {
            "grant_type": "client_credentials",
            "client_id": self.api_key,
            "client_secret": self.secret_key
        }
        response = requests.post(url, params=params)
        return response.json().get("access_token")

    def recognize(self, image_data: bytes) -> Dict[str, Any]:
        if not self.access_token:
            self.access_token = self.get_access_token()

        params = {"access_token": self.access_token}
        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        data = {"image": image_data}
        
        response = requests.post(self.url, params=params, headers=headers, data=data)
        result = response.json()
        
        if "words_result" in result:
            text = "\n".join([item["words"] for item in result["words_result"]])
            return {"success": True, "text": text}
        return {"success": False, "error": str(result.get("error_msg", "Unknown error"))}

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
        # OCR.space API keys
        self.ocr_space_keys = ['K87108387888957', 'K89499185488957', 'K82081561288957']
        self.current_ocr_space_index = 0
        
        # 初始化百度OCR
        self.baidu_provider = BaiduOCRProvider(
            "116369516",
            "MqDczhgq3uYFgLZ4G2sF7UPT",
            "b2DZEG2EQsF003S9O3WLaVrncB75jFHy"
        )
        
        # 初始化YDOCR
        self.yd_provider = YDOCRProvider(
            "ghjcy6bnuaxdusidcwwv2qfd",
            "g7dubchas4cplaix5lusulxs"
        )

    def recognize(self, image_path: str) -> Dict[str, Any]:
        with open(image_path, 'rb') as f:
            image_data = f.read()

        # 1. 尝试当前的 OCR.space API
        current_key = self.ocr_space_keys[self.current_ocr_space_index]
        ocr_space_provider = OCRSpaceProvider(current_key)
        
        try:
            result = ocr_space_provider.recognize(image_data)
            
            if result["success"]:
                # 成功后，更新索引到下一个key，供下次使用
                self.current_ocr_space_index = (self.current_ocr_space_index + 1) % len(self.ocr_space_keys)
                return result
        except Exception:
            pass

        # 2. OCR.space 失败，尝试百度OCR
        try:
            result = self.baidu_provider.recognize(image_data)
            if result["success"]:
                return result
        except Exception:
            pass

        # 3. 百度OCR失败，尝试YDOCR
        try:
            result = self.yd_provider.recognize(image_data)
            if result["success"]:
                return result
        except Exception:
            pass

        # 所有API都失败
        return {"success": False, "error": "所有OCR服务都失败了"}
