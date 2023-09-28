import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
import chromedriver_autoinstaller
from chromedriver_autoinstaller import install as install_chrome_driver
import os
from selenium.webdriver.common.keys import Keys



def test_clientIPRule(setup, request):
    chrome_driver_path = chromedriver_autoinstaller.install()
    chrome_service: Service = Service(executable_path=chrome_driver_path)

    chrome_options = webdriver.ChromeOptions()    
    # Add your options as needed    
    options = [
         "--headless",
         "--disable-gpu",
         "--no-sandbox",
    ]

    for option in options:
        chrome_options.add_argument(option)
    
    driver = webdriver.Chrome(options = chrome_options)

    targetHost = os.environ.get('TARGET_HOST')
    EMAIL = os.environ.get('LOGIN_EMAIL')
    PASSWORD = os.environ.get('LOGIN_PASSWORD')
    storageType = os.environ.get('STORAGE_TYPE')

        
    driver.get(targetHost)
    driver.find_element(By.NAME, "email").send_keys(EMAIL)
    driver.find_element(By.NAME, "password").send_keys(PASSWORD)
    driver.find_element(By.XPATH, "//button[@type='submit']").click()
    
    if storageType == "redis":
        time.sleep(4)
        driver.find_element(By.XPATH, "//button[normalize-space()='Redis']").click()
        print("Executing test on Redis data storage")
    elif storageType == "disk": 
        time.sleep(4)
        driver.find_element(By.XPATH, "//button[normalize-space()='Disk']").click()
        print("Executing test on Disk data storage")



    driver.find_element(By.XPATH, "//a[@href='#/profiles']").click()
    time.sleep(2)
    driver.find_element(By.XPATH, "//a[@href='#/profiles/create']").click()
    driver.find_element(By.ID, "name").send_keys("qa_test")
    driver.find_element(By.XPATH, "//button[@type='submit']").click()
    driver.find_element(By.XPATH, "//button[@aria-label='Sync API Storage']").click()
    time.sleep(2)
    driver.close
