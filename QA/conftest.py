import time

import pytest 
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.chrome.options import Options
import chromedriver_autoinstaller
from chromedriver_autoinstaller import install as install_chrome_driver
import os
from selenium.common.exceptions import NoSuchElementException





@pytest.fixture(scope="function")
def setup(request):
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

    
    driver.get("http://int6-api.whitefalcon.io/")
    EMAIL = os.environ.get('LOGIN_EMAIL')
    PASSWORD = os.environ.get('LOGIN_PASSWORD')
    driver.find_element(By.NAME, "email").send_keys(EMAIL)
    driver.find_element(By.NAME, "password").send_keys(PASSWORD)
    driver.find_element(By.XPATH, "//button[@type='submit']").click()
    wait = WebDriverWait(driver, 10)
    try:
      wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//button[normalize-space()='Redis']"))).click()
    # wait.until(expected_conditions.presence_of_element_located((By.CSS_SELECTOR, ".MuiButton-outlined"))).click()
    except NoSuchElementException:
      print("Element 1 not found")  
      try:
         wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//button[@aria-label='Select Storage Type']"))).click()
         wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//button[normalize-space()='Redis']"))).click()

      except NoSuchElementException:
         print("Element 2 also not found")
    request.function.driver = driver
    yield
    driver.close()
