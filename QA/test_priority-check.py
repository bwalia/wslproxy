import time

from selenium.webdriver import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.select import Select
from selenium.webdriver.support.wait import WebDriverWait
import os
from selenium.common.exceptions import NoSuchElementException

from selenium.webdriver.common.action_chains import ActionChains



def test_priorityCheck(setup, request):
    driver = request.function.driver
    server_name = request.function.server_name
    targetHost = request.function.targetHost 


    #driver.implicitly_wait(20)
    wait = WebDriverWait(driver, 20)

    def wait_for_element(by, selector):
      element = wait.until(expected_conditions.presence_of_element_located((by, selector)))
      return element


    # Creating rule with a high priority
    wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
    wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
    wait_for_element(By.NAME, "name").send_keys("High priority rule-py")
    priority = wait_for_element(By.NAME, "priority")
    priority.click()
    priority.send_keys(Keys.END)
    Length = len(priority.get_attribute("value"))
    priority.send_keys(Keys.BACKSPACE * Length)
    priority.send_keys("7")
    wait_for_element(By.NAME, "match.rules.path").send_keys("/public")
    element = wait_for_element(By.NAME, "match.response.code")
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    element.send_keys("200")
    time.sleep(2)

    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    wait_for_element(By.NAME, "match.response.allow").click()
    wait_for_element(By.NAME, "match.response.message").send_keys("SGlnaCBwcmlvcml0eSBydWxl")
    wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()


    # Creating rule with a low priority
    time.sleep(2)
    wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
    wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
    wait_for_element(By.NAME, "name").send_keys("Low priority rule-py")
    priority = wait_for_element(By.NAME, "priority")
    priority.click()
    priority.send_keys(Keys.END)
    Length = len(priority.get_attribute("value"))
    priority.send_keys(Keys.BACKSPACE * Length)
    priority.send_keys("3")
    wait_for_element(By.NAME, "match.rules.path").send_keys("/public")
    element = wait_for_element(By.NAME, "match.response.code")
    element.send_keys(Keys.END)
    length = len(element.get_attribute("value"))
    element.send_keys(Keys.BACKSPACE * length)
    element.send_keys("200")
    
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    wait.until(expected_conditions.presence_of_element_located((By.NAME, "match.response.allow"))).click()
    wait_for_element(By.NAME, "match.response.message").send_keys("cnVsZSB3aXRoIGxvdyBwcmlvcml0eQ==")
    wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()

    driver.refresh()

    # Apply both rules to the server
    wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
    wait_for_element(By.XPATH, f"//td[contains(., '{server_name}')]").click()

    wait_for_element(By.XPATH, "//a[@id='tabheader-1']").click()
    time.sleep(2)
    wait_for_element(By.XPATH, "//div[@id='rules']").click()
    time.sleep(2)
    try:
        wait_for_element(By.XPATH, "//li[contains(.,'High priority rule-py')]").click()
    except:
        # Scroll to the element to make it visible
        driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.XPATH, "//li[contains(.,'High priority rule-py')]"))
        # Wait for the element to be clickable
        wait.until(expected_conditions.element_to_be_clickable((By.XPATH, "//li[contains(.,'High priority rule-py')]"))).click()
        print("Rule not found")
     
    wait_for_element(By.CSS_SELECTOR, ".button-add-match_cases").click()
    time.sleep(2)
    wait_for_element(By.XPATH, "//div[@id='match_cases.0.statement']").click()
    time.sleep(2)
    try:
        wait_for_element(By.XPATH, "//li[contains(.,'Low priority rule-py')]").click()
    except:
        # Scroll to the element to make it visible
        driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.XPATH, "//li[contains(.,'Low priority rule-py')]"))
        time.sleep(2)
        # Wait for the element to be clickable
        wait.until(expected_conditions.element_to_be_clickable((By.XPATH, "//li[contains(.,'Low priority rule-py')]"))).click()
        print("Rule not found") 

    wait_for_element(By.XPATH, "//div[@id='match_cases.0.condition']").click()
    time.sleep(2)
    wait_for_element(By.XPATH, "//li[contains(text(),'AND')]").click()
        
    driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
    time.sleep(2)
    wait_for_element(By.XPATH, "//button[normalize-space()='Save']").click()
    wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
    wait_for_element(By.XPATH, f"//td[contains(.,'{server_name}')]").click()
    wait_for_element(By.XPATH, "//a[@id='tabheader-1']").click()
    driver.refresh()
    driver.back()
    driver.execute_script("location.reload()")

    # Clicking the sync API button
    time.sleep(4)
    sync_button = wait_for_element(By.XPATH, "//button[@aria-label='Sync API Storage']")
    sync_button.click()
    time.sleep(4)


   # Verifying the rules'
    try:
        driver.get("http://"+server_name+"/public")
    except: 
        time.sleep(2)
        driver.get("http://"+server_name+"/public")
    time.sleep(2)
    driver.refresh()
    response1 = wait_for_element(By.CSS_SELECTOR, "body").text
    time.sleep(2)
    assert "High priority" in response1
    print(response1)
