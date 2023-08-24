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

    driver.implicitly_wait(15)
    driver.delete_all_cookies()

    driver.get("http://api.int6.whitefalcon.io/")
    EMAIL = os.environ.get('LOGIN_EMAIL')
    PASSWORD = os.environ.get('LOGIN_PASSWORD')

    driver.find_element(By.NAME, "email").send_keys(EMAIL)
    driver.find_element(By.NAME, "password").send_keys(PASSWORD)
    driver.find_element(By.XPATH, "//button[@type='submit']").click()
    try:
        time.sleep(4)
        driver.find_element(By.XPATH, "//button[normalize-space()='Redis']").click()
        #wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//button[normalize-space()='Disk']"))).click()
    except:
        driver.get("http://api.int6.whitefalcon.io/")
        time.sleep(2)
        driver.find_element(By.NAME, "email").send_keys(EMAIL)
        driver.find_element(By.NAME, "password").send_keys(PASSWORD)
        driver.find_element(By.XPATH, "//button[@type='submit']").click()
        driver.find_element(By.XPATH, "//button[normalize-space()='Redis']").click()



    # Creating a server
    time.sleep(2)
    driver.find_element(By.XPATH, "//a[@href='#/servers']").click()
    time.sleep(2)
    driver.find_element(By.XPATH, "//a[@href='#/servers/create']").click()
    driver.find_element(By.NAME, "listens.0.listen").send_keys("82")
    driver.find_element(By.NAME, "server_name").send_keys("qa.int6.whitefalcon.io")
    driver.find_element(By.NAME, "proxy_server_name").send_keys("10.43.69.108:3009")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    driver.find_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()
    request.function.driver = driver
    yield
    time.sleep(2)
    wait = WebDriverWait(driver, 10)
    try:
        driver.get("http://api.int6.whitefalcon.io/#/")
    except:
        driver.execute_script("window.location.href = 'http://api.int6.whitefalcon.io#/';")
    
    driver.find_element(By.XPATH, "//a[@href='#/servers']").click()
    driver.find_element(By.XPATH, "(//input[@type='checkbox'])[2]").click()
    driver.find_element(By.CSS_SELECTOR, "button[aria-label='Delete']").click()
    time.sleep(6)
    driver.refresh()
    driver.close()