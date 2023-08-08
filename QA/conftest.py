import time

import pytest 
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.chrome.options import Options
import chromedriver_autoinstaller



@pytest.fixture(scope="function")
def setup(request):
    chromedriver_autoinstaller.install()
    chrome_options = webdriver.ChromeOptions()    
    # Add your options as needed    
    options = [
    
        "--headless"
        #"--disable-gpu",
        #"--window-size=1920,1200",
        #"--ignore-certificate-errors",
        #"--disable-extensions",
        #"--no-sandbox"
        #"--disable-dev-shm-usage",
        #'--remote-debugging-port=9222'
    ]

    for option in options:
      chrome_options.add_argument(option)

    
    driver = webdriver.Chrome(options = chrome_options)

    
    driver.get("http://int6-api.whitefalcon.io/")
    driver.find_element(By.NAME, "email").send_keys("ejeyd@example.com")
    driver.find_element(By.NAME, "password").send_keys("admin")
    driver.find_element(By.XPATH, "//button[@type='submit']").click()
    wait = WebDriverWait(driver, 10)
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//button[normalize-space()='Redis']"))).click()
    # wait.until(expected_conditions.presence_of_element_located((By.CSS_SELECTOR, ".MuiButton-outlined"))).click()
    request.function.driver = driver
    yield
    driver.close()