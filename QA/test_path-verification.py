import time

from selenium.webdriver import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.select import Select
from selenium.webdriver.support.wait import WebDriverWait
import os
from selenium.common.exceptions import NoSuchElementException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.select import Select



def test_pathRule(setup, request):
    driver = request.function.driver


# Creating rule for path condition - starts with
    #driver.implicitly_wait(15)
    wait = WebDriverWait(driver, 15)

    def wait_for_element(by, selector):
      element = wait.until(expected_conditions.presence_of_element_located((by, selector)))
      return element


    wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
    wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
    wait_for_element(By.NAME, "name").send_keys("Path rule starts with-py")

 
    wait_for_element(By.NAME, "match.rules.path").send_keys("/rou")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    element = wait_for_element(By.NAME, "match.response.code")
    # Clear the text using backspace key
    element.click()
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    # time.sleep(2)
    element.send_keys("200")
    wait_for_element(By.NAME, "match.response.allow").click()
    wait_for_element(By.NAME, "match.response.message").send_keys("c3RhcnRzIHdpdGggcGF0aCBydWxl")
    wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()


# Creating rule for path condition - ends with
    time.sleep(2)

    wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
    wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
    wait_for_element(By.NAME, "name").send_keys("Path rule ends with-py")
    wait_for_element(By.XPATH, "//div[@id='match.rules.path_key']").click()
    time.sleep(2)
    wait_for_element(By.XPATH, "//li[contains(.,'Ends With')]").click()
    wait_for_element(By.NAME, "match.rules.path").send_keys("ter")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    element = wait_for_element(By.NAME, "match.response.code")
    # Clear the text using backspace key
    element.click()
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    # time.sleep(2)
    element.send_keys("200")
    wait_for_element(By.NAME, "match.response.allow").click()
    wait_for_element(By.NAME, "match.response.message").send_keys("ZW5kcyB3aXRoIHBhdGggcnVsZQ==")
    wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()



# Creating rule for path condition - equals
    time.sleep(2)
    wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
    wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
    wait_for_element(By.NAME, "name").send_keys("Path rule equals-py")
    wait_for_element(By.XPATH, "//div[@id='match.rules.path_key']").click()
    time.sleep(2)
    wait_for_element(By.XPATH, "//li[normalize-space()='Equals']").click()
    wait_for_element(By.NAME, "match.rules.path").send_keys("/path")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    element = wait_for_element(By.NAME, "match.response.code")
    # Clear the text using backspace key
    element.click()
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    # time.sleep(2)
    element.send_keys("200")
    wait_for_element(By.NAME, "match.response.allow").click()
    wait_for_element(By.NAME, "match.response.message").send_keys("RXF1YWwgcGF0aCBwYXNzCg==")
    wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()
    driver.refresh()

    # Apply rules to the server

    wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
    wait_for_element(By.XPATH, "//td[contains(.,'qa.int6.whitefalcon.io')]").click()
    wait_for_element(By.XPATH, "//a[@id='tabheader-1']").click()
    wait_for_element(By.XPATH, "//div[@id='rules']").click()
    time.sleep(2)
    try:
        wait_for_element(By.XPATH, "//li[contains(.,'Path rule starts with-py')]").click()
    except:
        driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'Path rule starts with-py')]").click()
    
    time.sleep(2)
    wait_for_element(By.CSS_SELECTOR, ".button-add-match_cases").click()     
    time.sleep(2)  
    wait_for_element(By.XPATH, "//div[@id='match_cases.0.statement']").click()
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    time.sleep(2)
    wait_for_element(By.XPATH, "//li[contains(.,'Path rule ends with-py')]").click()
    wait_for_element(By.XPATH, "//div[@id='match_cases.0.condition']").click()
    wait_for_element(By.XPATH, "//li[contains(text(),'AND')]").click()



    wait_for_element(By.CSS_SELECTOR, ".button-add-match_cases").click()       
    wait_for_element(By.XPATH, "//div[@id='match_cases.1.statement']").click()
    time.sleep(2)
    try:
        wait_for_element(By.XPATH, "//li[contains(.,'Path rule equals-py')]").click()
    except:
        driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'Path rule equals-py')]").click()

    wait_for_element(By.XPATH, "//div[@id='match_cases.1.condition']").click()
    wait_for_element(By.XPATH, "//li[contains(text(),'AND')]").click()


    time.sleep(4)
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")

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

    # Verifying the rule 'Starts with'
    driver.get("http://qa.int6.whitefalcon.io/route")
    time.sleep(4)
    driver.refresh()
    response1 = wait_for_element(By.CSS_SELECTOR, "body").text
    assert "starts with" in response1
    print(response1)
    
    # Verifying the rule 'Ends with'
    driver.get("http://qa.int6.whitefalcon.io/outer")
    time.sleep(4)
    driver.refresh()
    response2 = wait_for_element(By.CSS_SELECTOR, "body").text
    assert "ends with" in response2
    print(response2)

    # Verifying the rule 'Equals'
    driver.get("http://qa.int6.whitefalcon.io/path")
    time.sleep(4)
    driver.refresh()
    response3 = wait_for_element(By.CSS_SELECTOR, "body").text
    assert "Equal" in response3
    print(response3)



