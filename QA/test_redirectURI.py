import time

from selenium.webdriver import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.select import Select
from selenium.webdriver.support.wait import WebDriverWait
import os
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.select import Select



def test_redirectRule(setup, request):
    driver = request.function.driver


# Creating redirect rule with 305
    #driver.implicitly_wait(20)
    wait = WebDriverWait(driver, 15)

    def wait_for_element(by, selector):
      element = wait.until(expected_conditions.presence_of_element_located((by, selector)))
      return element

    wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
    wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
    wait_for_element(By.NAME, "name").send_keys("redirect rule 305-py")

 
    wait_for_element(By.NAME, "match.rules.path").send_keys("/")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    element = wait_for_element(By.NAME, "match.response.code")
    # Clear the text using backspace key
    element.click()
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    # time.sleep(2)
    element.send_keys("305")
    wait_for_element(By.NAME, "match.response.allow").click()
    wait_for_element(By.NAME, "match.response.redirect_uri").send_keys("10.43.69.108:80")
    wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()


# Creating redirect rule with 302
    time.sleep(2)

    wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
    wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
    wait_for_element(By.NAME, "name").send_keys("redirect rule 302-py")
    time.sleep(2)
    wait_for_element(By.NAME, "match.rules.path").send_keys("/football")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    element = wait_for_element(By.NAME, "match.response.code")
    # Clear the text using backspace key
    element.click()
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    # time.sleep(2)
    element.send_keys("302")
    wait_for_element(By.NAME, "match.response.allow").click()
    wait_for_element(By.NAME, "match.response.redirect_uri").send_keys("https://www.bbc.com/sport/football")
    wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()


# Creating redirect rule with 301
    time.sleep(2)
    wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
    wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
    wait_for_element(By.NAME, "name").send_keys("redirect rule 301-py")
    time.sleep(2)
    wait_for_element(By.NAME, "match.rules.path").send_keys("/cricket")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    element = wait_for_element(By.NAME, "match.response.code")
    # Clear the text using backspace key
    element.click()
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    # time.sleep(2)
    element.send_keys("301")
    wait_for_element(By.NAME, "match.response.allow").click()
    wait_for_element(By.NAME, "match.response.redirect_uri").send_keys("https://www.bbc.com/sport/cricket")
    wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()
    driver.refresh()

    # Apply rules to the server
    time.sleep(2)
    wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
    wait_for_element(By.XPATH, "//td[contains(.,'qa.int6.whitefalcon.io')]").click()
    wait_for_element(By.XPATH, "//a[@id='tabheader-1']").click()
    wait_for_element(By.XPATH, "//div[@id='rules']").click()
    time.sleep(2)
    try:
        wait_for_element(By.XPATH, "//li[contains(.,'redirect rule 305-py')]").click()
    except:
        driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'redirect rule 305-py')]").click()
        time.sleep(2)
        print("rule not found")
    time.sleep(2)
    wait_for_element(By.CSS_SELECTOR, ".button-add-match_cases").click()     
    time.sleep(2)  
    wait_for_element(By.XPATH, "//div[@id='match_cases.0.statement']").click()
    time.sleep(2)
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    wait_for_element(By.XPATH, "//li[contains(.,'redirect rule 302-py')]").click()
    wait_for_element(By.XPATH, "//div[@id='match_cases.0.condition']").click()
    time.sleep(2)
    wait_for_element(By.XPATH, "//li[contains(text(),'AND')]").click()
    time.sleep(2)

    wait_for_element(By.CSS_SELECTOR, ".button-add-match_cases").click()       
    wait_for_element(By.XPATH, "//div[@id='match_cases.1.statement']").click()
    time.sleep(2)
    wait_for_element(By.XPATH, "//li[contains(.,'redirect rule 301-py')]").click()
    wait_for_element(By.XPATH, "//div[@id='match_cases.1.condition']").click()
    wait_for_element(By.XPATH, "//li[contains(text(),'AND')]").click()


    time.sleep(2)
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    time.sleep(2)
    wait_for_element(By.XPATH, "//button[normalize-space()='Save']").click()
    wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
    wait_for_element(By.XPATH, "//td[contains(.,'qa.int6.whitefalcon.io')]").click()
    wait_for_element(By.XPATH, "//a[@id='tabheader-1']").click()
    driver.refresh()
    driver.back()
    driver.execute_script("location.reload()")

    # Clicking the sync API button
    time.sleep(4)
    sync_button = wait_for_element(By.XPATH, "//button[@aria-label='Sync API Storage']")
    sync_button.click()
    time.sleep(4)

    # Verifying the rule redirect with 305
    driver.get("http://qa.int6.whitefalcon.io/")
    time.sleep(2)
    driver.refresh()
    time.sleep(2)
    response1 = wait_for_element(By.CSS_SELECTOR, "body").text
    assert "Login" in response1
    print(response1)
    
    # Verifying the rule redirect with 302
    time.sleep(2)
    driver.get("http://qa.int6.whitefalcon.io/football")
    wait.until(expected_conditions.title_contains("Football"))

    driver.refresh()
    time.sleep(2)
    try:
        response2 = wait_for_element(By.XPATH, "//a[@href='/sport/football']").text
        assert "Football" in response2
        print(response2)
    except TimeoutException:
        response2 = wait_for_element(By.XPATH, "//a[@href='/sport/football']").text
        assert "Football" in response2
        print(response2, "-Second attempt")
    # Verifying the rule redirect with 301

    driver.get("http://qa.int6.whitefalcon.io/cricket")
    wait.until(expected_conditions.title_contains("Cricket"))

    driver.refresh()
    time.sleep(4)
    response3 = wait_for_element(By.XPATH, "//a[@href='/sport/cricket']").text
    assert "Cricket" in response3
    print(response3)



