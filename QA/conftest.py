import time
import requests
import pytest 
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
import chromedriver_autoinstaller
from chromedriver_autoinstaller import install as install_chrome_driver
import os


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
    driver.maximize_window()

    driver.implicitly_wait(15)

    # Clearing the cookie 
    driver.delete_all_cookies()

    def handle_profile_api():
        # Calling the handle profile API
        url = "http://"+server_name+"/frontdoor/opsapi/handle-profile"
        body = {"profile":"qa_test"}
        response = requests.post(url, json=body)
        #print(response)


    targetHost = os.environ.get('TARGET_HOST')
    driver.get(targetHost)
    EMAIL = os.environ.get('LOGIN_EMAIL')
    PASSWORD = os.environ.get('LOGIN_PASSWORD')
    storageType = os.environ.get('STORAGE_TYPE')

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

    # Creating a server
    time.sleep(2)
    server_name = os.environ.get('SERVER_NAME')

    driver.find_element(By.XPATH, "//a[@href='#/servers']").click()
    time.sleep(2)
    driver.find_element(By.XPATH, "//a[@href='#/servers/create']").click()
    time.sleep(2)
    driver.find_element(By.NAME, "listens.0.listen").send_keys("82")
    driver.find_element(By.NAME, "server_name").send_keys(server_name)
    #driver.find_element(By.NAME, "proxy_server_name").send_keys("10.43.69.108:3009")
    driver.find_element(By.ID,"profile_id").click()
    time.sleep(2)
    driver.find_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
    time.sleep(2)
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    driver.find_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()

    handle_profile_api()

    request.function.driver = driver
    request.function.server_name = server_name
    request.function.targetHost = targetHost

    yield driver
    try:
        driver.get(targetHost+"/#/")
        time.sleep(4)
    except:
        driver.execute_script({"window.location.href = {}'/#/';"}.format(targetHost))
        time.sleep(4)
    
    driver.find_element(By.XPATH, "//a[@href='#/servers']").click()
    time.sleep(2)
    driver.find_element(By.ID, "profile_id").click()
    time.sleep(2)
    driver.find_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
    time.sleep(2)

    # Find the row containing the specific text
    server_row = driver.find_element(By.XPATH, f"//tr[td/span[contains(text(), '{server_name}')]]")

    checkbox = server_row.find_element(By.XPATH, ".//input[@type='checkbox']")
    checkbox.click()
    driver.find_element(By.CSS_SELECTOR, "button[aria-label='Delete']").click()
    time.sleep(2)
    sync_button = driver.find_element(By.XPATH, "//button[@aria-label='Sync API Storage']")
    sync_button.click()
    time.sleep(4)
    driver.close()