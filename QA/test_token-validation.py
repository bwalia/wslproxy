import time

from selenium.webdriver import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.select import Select
from selenium.webdriver.support.wait import WebDriverWait
import os
from selenium.common.exceptions import NoSuchElementException
from selenium.webdriver.common.action_chains import ActionChains



def test_authToken(setup, request):
    driver = request.function.driver
    wait = WebDriverWait(driver, 10)

    # Creating rule for access all requests
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//a[@href='#/rules']"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//a[@href='#/rules/create']"))).click()
    driver.find_element(By.NAME, "name").send_keys("Access all rule-py")
    driver.find_element(By.NAME, "match.rules.path").send_keys("/")
    element = driver.find_element(By.NAME, "match.response.code")
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    element.send_keys("305")
    driver.find_element(By.NAME, "match.response.redirect_uri").send_keys("10.43.69.108:3009")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    driver.find_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()

    # Creating rule for access request with /api
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//a[@href='#/rules']"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//a[@href='#/rules/create']"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.NAME, "name"))).send_keys("Access api rule-py")
    driver.find_element(By.NAME, "match.rules.path").send_keys("/api")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    driver.find_element(By.XPATH, "//div[@id='match.rules.jwt_token_validation']").click()
    driver.find_element(By.XPATH, "//li[normalize-space()='Cookie header validation']").click()
    driver.find_element(By.NAME, "match.rules.jwt_token_validation_value").send_keys("Authorization")
    tokenKey = os.environ.get('JWT_TOKEN_KEY')
    driver.find_element(By.NAME, "match.rules.jwt_token_validation_key").send_keys(tokenKey)
    element = driver.find_element(By.NAME, "match.response.code")
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    element.send_keys("305")
    driver.find_element(By.NAME, "match.response.redirect_uri").send_keys("10.43.69.108:3009")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    driver.find_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()
    driver.refresh()

    # Apply both rules to the server
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//a[@href='#/servers']"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//td[contains(.,'qa.int6.whitefalcon.io')]"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//a[@id='tabheader-1']"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//div[@id='rules']"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//li[contains(.,'Access all rule-py')]"))).click()
    try :
        hover_element = driver.find_element(By.XPATH, "//div[@id='match_cases.0.condition']")
        actions = ActionChains(driver)
        actions.move_to_element(hover_element).perform()
        wait.until(expected_conditions.presence_of_element_located((By.CSS_SELECTOR, ".button-remove-match_cases-0 > .MuiSvgIcon-root"))).click() 
    except NoSuchElementException:
        wait.until(expected_conditions.presence_of_element_located((By.CSS_SELECTOR, ".button-add-match_cases"))).click()
        print("Not found the remove rule element")

    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//div[@id='match_cases.0.statement']"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//li[contains(.,'Access api rule-py')]"))).click()

    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//div[@id='match_cases.0.condition']"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//li[contains(text(),'AND')]"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//button[normalize-space()='Save']"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//a[@href='#/servers']"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//td[contains(.,'qa.int6.whitefalcon.io')]"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//a[@id='tabheader-1']"))).click()
    driver.refresh()
    driver.back()
    driver.execute_script("location.reload()")

    # Clicking the sync API button
    time.sleep(4)
    sync_button = wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//button[@aria-label='Sync API Storage']")))
    sync_button.click()
    time.sleep(4)

    # Accessing API without Authorization token in cookies
    driver.get("http://qa.int6.whitefalcon.io/api/v2/sample-data.json")
    response = wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//h1[normalize-space()='Configuration not match!']"))).text
    time.sleep(2)
    assert "Configuration not match!" in response
    print(response)

    # Login and get Authorization cookie
    time.sleep(4)
    driver.get("http://qa.int6.whitefalcon.io/")
    time.sleep(4)
    EMAIL = os.environ.get('LOGIN_EMAIL')
    PASSWORD = os.environ.get('LOGIN_PASSWORD')
    driver.find_element(By.NAME, "email").send_keys(EMAIL)
    driver.find_element(By.NAME, "password").send_keys(PASSWORD)
    driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
    time.sleep(4)
    driver.refresh()
    driver.execute_script("location.reload()")
    login_text = driver.find_element(By.CLASS_NAME, "message-container").text
    assert "Thank you for logging in." in login_text
    print(login_text)

    # Accessing API with Authorization token in cookies
    driver.get("http://qa.int6.whitefalcon.io/api/v2/sample-data.json")
    time.sleep(4)
    driver.refresh()
    driver.execute_script("location.reload()")
    response = driver.find_element(By.CSS_SELECTOR, "body pre").text
    assert "smartphones" in response
    print(response)

    driver.delete_all_cookies()

    # Delete the rules
    # driver.get("http://int6-api.whitefalcon.io/")
    # time.sleep(2)
    # wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//a[text()='Rules']"))).click()

    # checkboxes = driver.find_elements(By.XPATH, "//td[contains(.,'Access all rule')]") # ,"//td[contains(.,'Access api rule')]") 
    # for checkbox in checkboxes:
    #     checkbox.click()
    #     time.sleep(4)

    # wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//button[normalize-space()='Delete']"))).click()
    # time.sleep(2)
    # driver.back()
    # wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//a[text()='Rules']"))).click()
    # time.sleep(4)


    # # Delete the rules
    # driver.get("http://int6-api.whitefalcon.io/")
    # time.sleep(2)
    # driver.find_element(By.XPATH, "//a[@href='#/rules']").click()
    # driver.find_element(By.XPATH, "(//input[@type='checkbox'])[2]").click()
    # driver.find_element(By.XPATH, "(//input[@type='checkbox'])[3]").click()
    # time.sleep(2)
    # driver.find_element(By.XPATH, "//button[normalize-space()='Delete']").click()
    # time.sleep(2)
    # driver.back()
    time.sleep(4)