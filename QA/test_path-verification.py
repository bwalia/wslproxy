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
    # time.sleep(2)
    driver.find_element(By.XPATH, "//a[@href='#/rules']").click()
    driver.find_element(By.XPATH, "//a[@href='#/rules/create']").click()
    driver.find_element(By.NAME, "name").send_keys("Path rule starts with-py")

 
    driver.find_element(By.NAME, "match.rules.path").send_keys("/rou")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    element = driver.find_element(By.NAME, "match.response.code")
    # Clear the text using backspace key
    element.click()
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    # time.sleep(2)
    element.send_keys("200")
    driver.find_element(By.NAME, "match.response.allow").click()
    driver.find_element(By.NAME, "match.response.message").send_keys("c3RhcnRzIHdpdGggcGF0aCBydWxl")
    driver.find_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()


# Creating rule for path condition - ends with
    time.sleep(2)
    wait = WebDriverWait(driver, 15)

    driver.find_element(By.XPATH, "//a[@href='#/rules']").click()
    driver.find_element(By.XPATH, "//a[@href='#/rules/create']").click()
    driver.find_element(By.NAME, "name").send_keys("Path rule ends with-py")
    driver.find_element(By.XPATH, "//div[@id='match.rules.path_key']").click()
    time.sleep(2)
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//li[contains(.,'Ends With')]"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.NAME, "match.rules.path"))).send_keys("ter")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    element = driver.find_element(By.NAME, "match.response.code")
    # Clear the text using backspace key
    element.click()
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    # time.sleep(2)
    element.send_keys("200")
    driver.find_element(By.NAME, "match.response.allow").click()
    driver.find_element(By.NAME, "match.response.message").send_keys("ZW5kcyB3aXRoIHBhdGggcnVsZQ==")
    driver.find_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()



# Creating rule for path condition - equals
    time.sleep(2)
    driver.find_element(By.XPATH, "//a[@href='#/rules']").click()
    driver.find_element(By.XPATH, "//a[@href='#/rules/create']").click()
    driver.find_element(By.NAME, "name").send_keys("Path rule equals-py")
    driver.find_element(By.XPATH, "//div[@id='match.rules.path_key']").click()
    time.sleep(2)
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//li[normalize-space()='Equals']"))).click()
    driver.find_element(By.NAME, "match.rules.path").send_keys("/path")
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    element = driver.find_element(By.NAME, "match.response.code")
    # Clear the text using backspace key
    element.click()
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    # time.sleep(2)
    element.send_keys("200")
    driver.find_element(By.NAME, "match.response.allow").click()
    driver.find_element(By.NAME, "match.response.message").send_keys("RXF1YWwgcGF0aCBwYXNzCg==")
    driver.find_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()
    driver.refresh()

    # Apply rules to the server

    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//a[@href='#/servers']"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//td[contains(.,'qa.int6.whitefalcon.io')]"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//a[@id='tabheader-1']"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//div[@id='rules']"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//li[contains(.,'Path rule starts with-py')]"))).click()
    time.sleep(2)
    # try :
    #     hover_element = driver.find_element(By.XPATH, "//div[@id='match_cases.0.condition']")
    #     actions = ActionChains(driver)
    #     actions.move_to_element(hover_element).perform()
    #     wait.until(expected_conditions.presence_of_element_located((By.CSS_SELECTOR, ".button-remove-match_cases-0 > .MuiSvgIcon-root"))).click() 
    # except NoSuchElementException:
    #     print("Not found the remove rule element")

    #     try:
    #       wait.until(expected_conditions.presence_of_element_located((By.CSS_SELECTOR, ".button-add-match_cases"))).click()
    #       time.sleep(2)
    #       driver.find_element(By.XPATH, "//div[@id='match_cases.0.statement']").click()
    #     except NoSuchElementException:
    #       print("Not found the remove rule element")
    
    wait.until(expected_conditions.presence_of_element_located((By.CSS_SELECTOR, ".button-add-match_cases"))).click()     
    time.sleep(2)  
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//div[@id='match_cases.0.statement']"))).click()
    time.sleep(2)
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//li[contains(.,'Path rule ends with-py')]"))).click()
    driver.find_element(By.XPATH, "//div[@id='match_cases.0.condition']").click()
    driver.find_element(By.XPATH, "//li[contains(text(),'AND')]").click()



    wait.until(expected_conditions.presence_of_element_located((By.CSS_SELECTOR, ".button-add-match_cases"))).click()       
    driver.find_element(By.XPATH, "//div[@id='match_cases.1.statement']").click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//li[contains(.,'Path rule equals-py')]"))).click()
    driver.find_element(By.XPATH, "//div[@id='match_cases.1.condition']").click()
    driver.find_element(By.XPATH, "//li[contains(text(),'AND')]").click()


    time.sleep(4)
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")

    driver.find_element(By.XPATH, "//button[normalize-space()='Save']").click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//a[@href='#/servers']"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//td[contains(.,'qa.int6.whitefalcon.io')]"))).click()
    wait.until(expected_conditions.presence_of_element_located((By.XPATH, "//a[@id='tabheader-1']"))).click()
    driver.refresh()
    driver.back()
    driver.execute_script("location.reload()")

    # Clicking the sync API button
    time.sleep(4)
    sync_button = driver.find_element(By.XPATH, "//button[@aria-label='Sync API Storage']")
    sync_button.click()
    time.sleep(4)

    # Verifying the rule 'Starts with'
    driver.get("http://qa.int6.whitefalcon.io/route")
    time.sleep(4)
    driver.refresh()
    response1 = driver.find_element(By.CSS_SELECTOR, "body").text
    assert "starts with" in response1
    print(response1)
    
    # Verifying the rule 'Ends with'
    driver.get("http://qa.int6.whitefalcon.io/outer")
    time.sleep(4)
    driver.refresh()
    response2 = driver.find_element(By.CSS_SELECTOR, "body").text
    assert "ends with" in response2
    print(response2)

    # Verifying the rule 'Equals'
    driver.get("http://qa.int6.whitefalcon.io/path")
    time.sleep(4)
    driver.refresh()
    response3 = driver.find_element(By.CSS_SELECTOR, "body").text
    assert "Equal" in response3
    print(response3)



