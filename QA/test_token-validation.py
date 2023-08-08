import time

from selenium.webdriver import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.select import Select
from selenium.webdriver.support.wait import WebDriverWait


def test_server(setup, request):
    driver = request.function.driver

    # Creating a server
    time.sleep(2)
    driver.find_element(By.XPATH, "//a[@href='#/servers']").click()
    driver.find_element(By.XPATH, "//a[@href='#/servers/create']").click()
    driver.find_element(By.NAME, "listens.0.listen").send_keys("82")
    driver.find_element(By.NAME, "server_name").send_keys("int6-qa.whitefalcon.io")
    driver.find_element(By.NAME, "proxy_server_name").send_keys("10.43.69.108:3009")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    driver.find_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()

    # Creating rule for access all requests
    # time.sleep(2)
    driver.find_element(By.XPATH, "//a[@href='#/rules']").click()
    driver.find_element(By.XPATH, "//a[@href='#/rules/create']").click()
    driver.find_element(By.NAME, "name").send_keys("Access all rule")
    driver.find_element(By.NAME, "match.rules.path").send_keys("/")
    element = driver.find_element(By.NAME, "match.response.code")
    # Clear the text using backspace key
    time.sleep(2)
    element.click()
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    # time.sleep(2)
    element.send_keys("305")
    driver.find_element(By.NAME, "match.response.redirect_uri").send_keys("10.43.69.108:3009")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    driver.find_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()

    # Creating rule for access request with /api
    # time.sleep(2)
    driver.find_element(By.XPATH, "//a[@href='#/rules']").click()
    driver.find_element(By.XPATH, "//a[@href='#/rules/create']").click()
    driver.find_element(By.NAME, "name").send_keys("Access api rule")
    driver.find_element(By.NAME, "match.rules.path").send_keys("/api")
    driver.find_element(By.XPATH, "//div[@id='match.rules.jwt_token_validation']").click()
    driver.find_element(By.XPATH, "//li[normalize-space()='Cookie header validation']").click()
    driver.find_element(By.NAME, "match.rules.jwt_token_validation_value").send_keys("Authorization")
    driver.find_element(By.NAME, "match.rules.jwt_token_validation_key").send_keys("HCsKpxQ4hU97V5us5TCwvLnAVBgLqNd1dP2R-4Uywg7946J3zAqT9EOA5hdWRCQn")
    # time.sleep(2)
    element = driver.find_element(By.NAME, "match.response.code")

    # Clear the text using backspace key
    element.click()
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    # time.sleep(2)
    element.send_keys("305")
    driver.find_element(By.NAME, "match.response.redirect_uri").send_keys("10.43.69.108:3009")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    driver.find_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()

    # Apply both rules to the server
    driver.find_element(By.XPATH, "//a[@href='#/servers']").click()
    driver.find_element(By.XPATH, "//td[contains(.,'82')]").click()
    driver.find_element(By.XPATH, "//a[@id='tabheader-1']").click()
    driver.find_element(By.XPATH, "//div[@id='rules']").click()
    driver.find_element(By.XPATH, "//li[contains(.,'Access all rule')]").click()
    driver.find_element(By.CSS_SELECTOR, ".button-add-match_cases").click()

    driver.find_element(By.XPATH, "//div[@id='match_cases.0.statement']").click()
    driver.find_element(By.XPATH, "//li[contains(.,'Access api rule')]").click()
    driver.find_element(By.XPATH, "//div[@id='match_cases.0.condition']").click()
    time.sleep(2)
    driver.find_element(By.XPATH, "//li[contains(.,'AND')]").click()
    time.sleep(2)
    driver.find_element(By.XPATH, "//button[normalize-space()='Save']").click()
    # time.sleep(2)
    driver.find_element(By.XPATH, "//a[@href='#/servers']").click()
    driver.find_element(By.XPATH, "//td[contains(.,'82')]").click()
    driver.find_element(By.XPATH, "//a[@id='tabheader-1']").click()
    driver.back()

    # Accessing api without Authorization token in cookies
    driver.get("http://int6-qa.whitefalcon.io/api/v2/sample-data.json")
    # time.sleep(4)
    response = driver.find_element(By.XPATH, "//pre[contains(text(),'<!DOCTYPE html>')]").text
    assert "No Rules" in response
    print(response)

    # login and get Authorization cookie
    driver.get("http://int6-qa.whitefalcon.io/")
    time.sleep(4)
    driver.find_element(By.NAME, "email").send_keys("ejeyd@example.com")
    driver.find_element(By.NAME, "password").send_keys("admin")
    driver.find_element(By.XPATH, "//button[@type='submit']").click()
    # time.sleep(2)
    driver.refresh()
    time.sleep(4)
    driver.refresh()
    driver.execute_script("location.reload()")
    driver.execute_script("location.reload()")

    loginText = driver.find_element(By.XPATH, "//div[@class='message-container']").text
    assert "Thank you for logging in." in loginText
    print(loginText)

    # Accessing api with Authorization token in cookies
    driver.get("http://int6-qa.whitefalcon.io/api/v2/sample-data.json")
    time.sleep(4)
    driver.refresh()
    driver.execute_script("location.reload()")
    response = driver.find_element(By.CSS_SELECTOR, "body pre").text
    assert "smartphones" in response
    print(response)

    driver.delete_all_cookies()

    # Delete the rules
    driver.get("http://int6-api.whitefalcon.io/")
    time.sleep(2)
    driver.find_element(By.XPATH, "//a[@href='#/rules']").click()
    driver.find_element(By.XPATH, "(//input[@type='checkbox'])[2]").click()
    driver.find_element(By.XPATH, "(//input[@type='checkbox'])[3]").click()
    time.sleep(2)
    driver.find_element(By.XPATH, "//button[normalize-space()='Delete']").click()
    time.sleep(2)
    driver.back()
    driver.find_element(By.XPATH, "//a[@href='#/rules']").click()
    time.sleep(4)
