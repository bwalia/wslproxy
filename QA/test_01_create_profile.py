import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
import chromedriver_autoinstaller
from chromedriver_autoinstaller import install as install_chrome_driver
import os
from baseclass import TestBaseClass
import pytest

@pytest.mark.usefixtures("login_setup")
class Test_ClassProfile(TestBaseClass):

    def test_creatProfile(self):
        driver = self.driver
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


        time.sleep(2)
        driver.find_element(By.XPATH, "//a[@href='#/profiles']").click()
        time.sleep(2)
        driver.find_element(By.XPATH, "//a[@href='#/profiles/create']").click()
        driver.find_element(By.ID, "name").send_keys("qa_test")
        driver.find_element(By.XPATH, "//button[@type='submit']").click()
        time.sleep(2)
        driver.find_element(By.XPATH, "//button[@aria-label='Sync API Storage']").click()
        time.sleep(2)
